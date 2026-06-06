import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { insertNote, saveEmbedding, serializeTags } from './repository.ts';
import {
  computeSignalHash,
  detectDanglingLinks,
  detectHiddenArcs,
  detectStaleState,
  detectTagBursts,
  listSignals,
  setSignalStatus,
  upsertSignal,
} from './signals.ts';

const DAY = 86_400_000;

// One-hot unit vectors give clean L2 separation: identical => distance 0,
// distinct => distance sqrt(2) (well past any threshold).
const unit = (i: number): number[] => {
  const v = new Array(768).fill(0);
  v[i] = 1;
  return v;
};

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-signals-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (
  opts: Partial<{
    title: string;
    content: string;
    tags: string[];
    layer: 'past' | 'state' | 'rule';
    category: string;
    createdAt: number;
    updatedAt: number;
    embedding: number[];
  }> = {},
) => {
  const note = insertNote(client, {
    title: opts.title ?? `note-${Math.random().toString(36).slice(2)}`,
    content: opts.content ?? 'x',
    filePath: join(dbDir, `${Math.random().toString(36).slice(2)}.md`),
    source: 'manual',
    layer: opts.layer ?? 'past',
    category: opts.category,
    tags: serializeTags(opts.tags ?? []),
  });
  if (opts.createdAt !== undefined || opts.updatedAt !== undefined) {
    client.sqlite
      .prepare('UPDATE notes SET created_at = ?, updated_at = ? WHERE id = ?')
      .run(opts.createdAt ?? note.createdAt, opts.updatedAt ?? note.updatedAt, note.id);
  }
  if (opts.embedding) saveEmbedding(client, note.id, opts.embedding);
  return note;
};

describe('computeSignalHash', () => {
  it('is stable regardless of evidence order', () => {
    const a = computeSignalHash({ type: 'hidden_arc', evidenceIds: [3, 1, 2], reasoning: '' });
    const b = computeSignalHash({ type: 'hidden_arc', evidenceIds: [1, 2, 3], reasoning: '' });
    expect(a).toBe(b);
  });

  it('uses explicit identity when provided', () => {
    const a = computeSignalHash({
      type: 'dangling_link',
      evidenceIds: [1],
      reasoning: '',
      identity: '1:foo',
    });
    const b = computeSignalHash({
      type: 'dangling_link',
      evidenceIds: [1],
      reasoning: '',
      identity: '1:bar',
    });
    expect(a).not.toBe(b);
  });
});

describe('upsertSignal', () => {
  it('is idempotent and never resurrects a triaged signal', () => {
    const candidate = {
      type: 'tag_burst' as const,
      evidenceIds: [1, 2],
      reasoning: 'burst',
      identity: 'rust:2026-06',
    };
    const first = upsertSignal(client, candidate);
    setSignalStatus(client, first.id, 'dismissed');

    const second = upsertSignal(client, candidate);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('dismissed');
    expect(listSignals(client)).toHaveLength(1);
  });
});

describe('detectDanglingLinks', () => {
  it('flags links to non-existent notes and ignores resolvable ones', () => {
    addNote({ title: 'Target' });
    const src = addNote({ title: 'Source', content: 'see [[Target]] and [[Ghost]]' });

    const candidates = detectDanglingLinks(client);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('dangling_link');
    expect(candidates[0].evidenceIds).toEqual([src.id]);
    expect(candidates[0].reasoning).toContain('Ghost');
  });
});

describe('detectStaleState', () => {
  it('flags a state note with newer related past notes', () => {
    const t0 = Date.now() - 100 * DAY;
    const state = addNote({
      title: 'Roadmap',
      layer: 'state',
      embedding: unit(0),
      createdAt: t0,
      updatedAt: t0,
    });
    addNote({ layer: 'past', embedding: unit(0), createdAt: t0 + 10 * DAY });
    addNote({ layer: 'past', embedding: unit(0), createdAt: t0 + 20 * DAY });
    // older than the state's last update — must NOT count
    addNote({ layer: 'past', embedding: unit(0), createdAt: t0 - 10 * DAY });
    // unrelated direction — must NOT count
    addNote({ layer: 'past', embedding: unit(1), createdAt: t0 + 30 * DAY });

    const candidates = detectStaleState(client, { minNewer: 2 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].evidenceIds[0]).toBe(state.id);
    expect(candidates[0].evidenceIds).toHaveLength(3); // state + 2 newer
  });

  it('does not flag when fewer than minNewer', () => {
    const t0 = Date.now() - 100 * DAY;
    addNote({ layer: 'state', embedding: unit(0), createdAt: t0, updatedAt: t0 });
    addNote({ layer: 'past', embedding: unit(0), createdAt: t0 + 10 * DAY });
    expect(detectStaleState(client, { minNewer: 2 })).toHaveLength(0);
  });
});

describe('detectTagBursts', () => {
  it('flags a dormant tag that resurfaced', () => {
    const now = Date.now();
    addNote({ tags: ['rust'], createdAt: now - 300 * DAY });
    addNote({ tags: ['rust'], createdAt: now - 2 * DAY });
    addNote({ tags: ['rust'], createdAt: now - 1 * DAY });

    const candidates = detectTagBursts(client, { now, minBurst: 2 });
    const rust = candidates.find((c) => c.identity?.startsWith('rust:'));
    expect(rust).toBeDefined();
    expect(rust?.evidenceIds).toHaveLength(2);
  });

  it('ignores a brand-new tag (no prior history)', () => {
    const now = Date.now();
    addNote({ tags: ['fresh'], createdAt: now - 2 * DAY });
    addNote({ tags: ['fresh'], createdAt: now - 1 * DAY });
    expect(detectTagBursts(client, { now, minBurst: 2 })).toHaveLength(0);
  });

  it('ignores a steadily-used tag (no dormancy)', () => {
    const now = Date.now();
    addNote({ tags: ['steady'], createdAt: now - 20 * DAY });
    addNote({ tags: ['steady'], createdAt: now - 2 * DAY });
    addNote({ tags: ['steady'], createdAt: now - 1 * DAY });
    expect(detectTagBursts(client, { now, minBurst: 2 })).toHaveLength(0);
  });
});

describe('detectHiddenArcs', () => {
  const buildArc = () => {
    const now = Date.now();
    return [
      addNote({ tags: ['arc'], embedding: unit(5), createdAt: now - 400 * DAY }),
      addNote({ tags: ['arc'], embedding: unit(5), createdAt: now - 300 * DAY }),
      addNote({ tags: ['arc'], embedding: unit(5), createdAt: now - 200 * DAY }),
      addNote({ tags: ['arc'], embedding: unit(5), createdAt: now - 10 * DAY }),
    ];
  };

  it('flags an un-synthesized arc spanning months with no links', () => {
    const arc = buildArc();
    const candidates = detectHiddenArcs(client, { minMembers: 4 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('hidden_arc');
    expect(candidates[0].evidenceIds).toEqual(arc.map((n) => n.id).sort((a, b) => a - b));
  });

  it('does not flag an arc that is already densely linked', () => {
    const arc = buildArc();
    const link = client.sqlite.prepare(
      "INSERT INTO note_links(source_id, target_id, source) VALUES (?, ?, 'wiki')",
    );
    link.run(arc[0].id, arc[1].id);
    link.run(arc[2].id, arc[3].id);

    expect(detectHiddenArcs(client, { minMembers: 4 })).toHaveLength(0);
  });

  it('emits one signal per embedding component regardless of tags', () => {
    const now = Date.now();
    // Same component (shared embedding) but mixed tags => still one arc.
    for (const days of [400, 300, 200, 10]) {
      addNote({ tags: ['arc', 'arc2'], embedding: unit(5), createdAt: now - days * DAY });
    }
    const candidates = detectHiddenArcs(client, { minMembers: 4 });
    expect(candidates).toHaveLength(1);
  });

  it('does not flag clusters that do not span enough time', () => {
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      addNote({ tags: ['arc'], embedding: unit(5), createdAt: now - i * DAY });
    }
    expect(detectHiddenArcs(client, { minMembers: 4 })).toHaveLength(0);
  });
});
