import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { setNoteEvidence } from './evidence.ts';
import { linkTargets } from './link-index.ts';
import { deleteNote, insertNote, saveEmbedding, serializeTags, updateNote } from './repository.ts';
import {
  computeSignalHash,
  detectDanglingLinks,
  detectHiddenArcs,
  detectStaleState,
  detectTagBursts,
  findBestProactiveSignal,
  listSignals,
  proactiveSignalFor,
  refreshSignals,
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
    authoredAt: number;
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
    authoredAt: opts.authoredAt,
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

    const { candidates } = detectStaleState(client, { minNewer: 2 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].evidenceIds[0]).toBe(state.id);
    expect(candidates[0].evidenceIds).toHaveLength(3); // state + 2 newer
  });

  it('leaves a note that names its sources to the comparison', () => {
    const t0 = Date.now() - 100 * DAY;
    const state = addNote({
      title: 'Roadmap',
      layer: 'state',
      embedding: unit(0),
      createdAt: t0,
      updatedAt: t0,
    });
    const source = addNote({ layer: 'past', embedding: unit(0), createdAt: t0 - 30 * DAY });
    addNote({ layer: 'past', embedding: unit(0), createdAt: t0 + 10 * DAY });
    addNote({ layer: 'past', embedding: unit(0), createdAt: t0 + 20 * DAY });

    expect(detectStaleState(client, { minNewer: 2 }).candidates).toHaveLength(1);

    setNoteEvidence(client, state.id, [source.id]);
    expect(detectStaleState(client, { minNewer: 2 }).candidates).toHaveLength(0);
  });

  it('does not flag when fewer than minNewer', () => {
    const t0 = Date.now() - 100 * DAY;
    addNote({ layer: 'state', embedding: unit(0), createdAt: t0, updatedAt: t0 });
    addNote({ layer: 'past', embedding: unit(0), createdAt: t0 + 10 * DAY });
    expect(detectStaleState(client, { minNewer: 2 }).candidates).toHaveLength(0);
  });

  it('does not count freshly imported notes that were authored before the state update', () => {
    const t0 = Date.now() - 100 * DAY;
    addNote({ layer: 'state', embedding: unit(0), createdAt: t0, updatedAt: t0 });
    // Imported after t0 (created_at = now) but authored long before — old
    // knowledge entering the index must not read as "newer evidence".
    addNote({ layer: 'past', embedding: unit(0), authoredAt: t0 - 20 * DAY });
    addNote({ layer: 'past', embedding: unit(0), authoredAt: t0 - 30 * DAY });
    expect(detectStaleState(client, { minNewer: 2 }).candidates).toHaveLength(0);
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

describe('findBestProactiveSignal', () => {
  it('picks the highest-priority new signal involving the note', () => {
    upsertSignal(client, {
      type: 'dangling_link',
      evidenceIds: [1],
      reasoning: 'd',
      identity: 'd1',
    });
    upsertSignal(client, {
      type: 'hidden_arc',
      evidenceIds: [1, 2, 3, 4],
      reasoning: 'a',
      identity: 'a1',
    });
    upsertSignal(client, {
      type: 'tag_burst',
      evidenceIds: [1, 9],
      reasoning: 'b',
      identity: 'b1',
    });
    expect(findBestProactiveSignal(listSignals(client), 1)?.type).toBe('hidden_arc');
  });

  it('ignores notes not involved and non-new statuses', () => {
    const arc = upsertSignal(client, {
      type: 'hidden_arc',
      evidenceIds: [5, 6, 7, 8],
      reasoning: 'a',
      identity: 'a2',
    });
    setSignalStatus(client, arc.id, 'dismissed'); // declined → must not resurface
    const burst = upsertSignal(client, {
      type: 'tag_burst',
      evidenceIds: [5, 10],
      reasoning: 'b',
      identity: 'b2',
    });

    expect(findBestProactiveSignal(listSignals(client), 99)).toBeUndefined();
    expect(findBestProactiveSignal(listSignals(client), 5)?.id).toBe(burst.id);
  });
});

describe('refreshSignals watermarks', () => {
  const seedArc = () => {
    const now = Date.now();
    for (const d of [400, 300, 200, 10]) {
      addNote({ tags: ['x'], embedding: unit(9), createdAt: now - d * DAY });
    }
  };

  it('skips detection when nothing changed, re-runs after a change or with force', () => {
    seedArc();
    expect(refreshSignals(client).length).toBeGreaterThan(0); // first run detects
    expect(refreshSignals(client)).toHaveLength(0); // clean → short-circuit
    expect(refreshSignals(client, { force: true }).length).toBeGreaterThan(0); // forced

    addNote({ tags: ['y'], content: 'see [[Nope]]' });
    expect(refreshSignals(client).length).toBeGreaterThan(0); // logged → dirty again
  });

  it('leaves a detector alone when only what it cannot read has moved', () => {
    const note = addNote({ content: 'see [[Nope]]' });
    refreshSignals(client);
    const before = listSignals(client).map((s) => s.id);

    updateNote(client, note.id, { tags: serializeTags(['unrelated']) });

    // tag_burst is the only detector watching tags, and it finds nothing here,
    // so the dangling signal survives rather than being retired on its behalf.
    expect(refreshSignals(client)).toHaveLength(0);
    expect(listSignals(client).map((s) => s.id)).toEqual(before);
  });

  it('wakes on a deletion, which bumps no timestamp of its own', () => {
    const target = addNote({ title: 'Target' });
    addNote({ content: 'see [[Target]]' });
    refreshSignals(client);
    expect(listSignals(client).filter((s) => s.type === 'dangling_link')).toHaveLength(0);

    deleteNote(client, target.id);

    expect(refreshSignals(client).some((s) => s.type === 'dangling_link')).toBe(true);
  });
});

describe('proactiveSignalFor', () => {
  it('surfaces a dead link in the note just written', () => {
    const note = addNote({ content: 'see [[Nothing At All]]' });
    expect(proactiveSignalFor(client, note.id)?.type).toBe('dangling_link');
  });

  it('says nothing about a note with no answerable signal', () => {
    const note = addNote({ content: 'plain prose' });
    expect(proactiveSignalFor(client, note.id)).toBeUndefined();
  });

  it('hints about the written note only, though the refresh it rides on sees all', () => {
    const other = addNote({ content: 'see [[Also Missing]]' });
    const note = addNote({ content: 'plain prose' });

    expect(proactiveSignalFor(client, note.id)).toBeUndefined();
    // The write refreshes, so a neighbour's dead link is recorded too — it is
    // just not offered as this write's hint.
    expect(listSignals(client).some((s) => s.evidenceIds.includes(other.id))).toBe(true);
  });

  it('surfaces a stale state note the write itself unsettled', () => {
    const t0 = Date.now() - 100 * DAY;
    const state = addNote({
      title: 'Roadmap',
      layer: 'state',
      embedding: unit(3),
      createdAt: t0,
      updatedAt: t0,
    });
    addNote({ layer: 'past', embedding: unit(3), createdAt: t0 + 10 * DAY });
    addNote({ layer: 'past', embedding: unit(3), createdAt: t0 + 20 * DAY });
    refreshSignals(client);

    const written = addNote({ layer: 'past', embedding: unit(3), createdAt: t0 + 30 * DAY });
    const hint = proactiveSignalFor(client, written.id);

    expect(hint?.type).toBe('stale_state');
    expect(hint?.evidenceIds[0]).toBe(state.id);
  });

  it('leaves the next read with nothing to do', () => {
    const note = addNote({ content: 'see [[Nothing At All]]' });
    proactiveSignalFor(client, note.id);

    expect(refreshSignals(client)).toHaveLength(0);
  });

  it('persists what it found, so a later refresh does not raise it twice', () => {
    const note = addNote({ content: 'see [[Nothing At All]]' });
    const hint = proactiveSignalFor(client, note.id);

    refreshSignals(client);
    const dangling = listSignals(client).filter(
      (s) => s.type === 'dangling_link' && s.evidenceIds.includes(note.id),
    );
    expect(dangling.map((s) => s.id)).toEqual([hint?.id]);
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

describe('linkTargets', () => {
  it('reads the target, not the display text', () => {
    expect(linkTargets('see [[Note|shown as this]]')).toEqual(['Note']);
  });

  it('keeps the heading anchor for resolution to interpret', () => {
    expect(linkTargets('see [[Note#Some Heading]]')).toEqual(['Note#Some Heading']);
  });

  it('drops display text while keeping the anchor, and dedupes', () => {
    expect(linkTargets('[[Note#H|shown]] and [[Note]]')).toEqual(['Note#H', 'Note']);
  });

  it('normalizes composed forms so NFD and NFC name the same note', () => {
    expect(linkTargets('[[\uAC00\u11A8]]')).toEqual(['\uAC01']);
  });

  it('finds nothing in text without links', () => {
    expect(linkTargets('본문뿐이다')).toEqual([]);
  });
});

describe('detectDanglingLinks — link syntax', () => {
  it('does not flag a link that only carries display text', () => {
    addNote({ title: '도착' });
    addNote({ title: '출발', content: 'see [[도착|이렇게 보임]]' });
    expect(detectDanglingLinks(client)).toHaveLength(0);
  });

  it('reaches a note whose own title holds a #', () => {
    addNote({ title: '세션 인계 — 작업지시서 #2219 실행' });
    addNote({ title: '출발', content: '이어서 [[세션 인계 — 작업지시서 #2219 실행]]' });
    expect(detectDanglingLinks(client)).toHaveLength(0);
  });

  it('still reads a # as an anchor when no note is named that way', () => {
    addNote({ title: '도착' });
    addNote({ title: '출발', content: 'see [[도착#어느 절]]' });
    expect(detectDanglingLinks(client)).toHaveLength(0);
  });

  it('does not flag a link into a heading of a note that exists', () => {
    addNote({ title: '도착' });
    addNote({ title: '출발', content: 'see [[도착#어떤 절]]' });
    expect(detectDanglingLinks(client)).toHaveLength(0);
  });
});

describe('refreshSignals retirement', () => {
  const dangling = () => listSignals(client, { type: 'dangling_link' });

  it('drops a dangling-link signal once the target note is written', () => {
    const src = addNote({ title: '출발', content: 'see [[아직 없는 노트]]' });
    refreshSignals(client, { force: true });
    expect(dangling()).toHaveLength(1);

    addNote({ title: '아직 없는 노트' });
    client.sqlite
      .prepare('UPDATE notes SET updated_at = ? WHERE id = ?')
      .run(Date.now() + DAY, src.id);
    refreshSignals(client, { force: true });
    expect(dangling()).toHaveLength(0);
  });

  it('keeps a signal whose target still does not exist', () => {
    addNote({ title: '출발', content: 'see [[없는 노트]]' });
    refreshSignals(client, { force: true });
    refreshSignals(client, { force: true });
    expect(dangling()).toHaveLength(1);
  });

  it('never resurrects or discards a signal the user already triaged', () => {
    const src = addNote({ title: '출발', content: 'see [[없는 노트]]' });
    refreshSignals(client, { force: true });
    setSignalStatus(client, dangling()[0].id, 'dismissed');

    client.sqlite.prepare('UPDATE notes SET content = ? WHERE id = ?').run('링크 없음', src.id);
    refreshSignals(client, { force: true });

    expect(dangling()).toHaveLength(1);
    expect(dangling()[0].status).toBe('dismissed');
  });
});
