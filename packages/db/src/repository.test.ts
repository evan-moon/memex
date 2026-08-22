import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  findFlashbacks,
  findUnresolvedLinks,
  getBacklinks,
  resolveLinkTargets,
  getNote,
  insertNote,
  parseTags,
  saveEmbedding,
  searchNotes,
  serializeTags,
  syncLinks,
  updateNote,
} from './repository.ts';

describe('parseTags', () => {
  it('parses a valid JSON tag array', () => {
    expect(parseTags('["typescript","monorepo"]')).toEqual(['typescript', 'monorepo']);
  });

  it('returns an empty array for an empty JSON array', () => {
    expect(parseTags('[]')).toEqual([]);
  });

  it('returns an empty array for invalid JSON', () => {
    expect(parseTags('not-json')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseTags('')).toEqual([]);
  });
});

describe('serializeTags', () => {
  it('serializes a tag array to JSON', () => {
    expect(serializeTags(['typescript', 'monorepo'])).toBe('["typescript","monorepo"]');
  });

  it('serializes an empty array', () => {
    expect(serializeTags([])).toBe('[]');
  });

  it('round-trips through parseTags', () => {
    const tags = ['a', 'b', 'c'];
    expect(parseTags(serializeTags(tags))).toEqual(tags);
  });
});

describe('notes.layer', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-test-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('insertNote persists an explicit layer', () => {
    const note = insertNote(client, {
      title: 'roadmap',
      content: 'todo: ...',
      filePath: join(dbDir, 'roadmap.md'),
      source: 'manual',
      layer: 'state',
    });
    expect(note.layer).toBe('state');
    expect(getNote(client, note.id)?.layer).toBe('state');
  });

  it('insertNote defaults missing layer to past', () => {
    const note = insertNote(client, {
      title: 'old retro',
      content: 'looked back',
      filePath: join(dbDir, 'old-retro.md'),
      source: 'manual',
    });
    expect(note.layer).toBe('past');
  });

  it('updateNote is layer-agnostic at the DB layer (service guards immutability)', () => {
    const note = insertNote(client, {
      title: 'rule',
      content: 'be terse',
      filePath: join(dbDir, 'rule.md'),
      source: 'manual',
      layer: 'rule',
    });

    const updated = updateNote(client, note.id, { content: 'be even more terse' });
    expect(updated.content).toBe('be even more terse');
    expect(updated.layer).toBe('rule');
  });
});

describe('findUnresolvedLinks', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-unresolved-'));
    client = openDb(dbDir);
    insertNote(client, {
      title: 'Opula 유료화 전략',
      content: 'x',
      filePath: join(dbDir, 'a.md'),
      source: 'manual',
      layer: 'past',
    });
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('returns nothing when every link matches a note title', () => {
    expect(findUnresolvedLinks(client, 'see [[Opula 유료화 전략]] for context')).toEqual([]);
  });

  it('reports a link whose target does not exist', () => {
    expect(findUnresolvedLinks(client, 'see [[Opula 유료화 전략]] and [[Nope]]')).toEqual(['Nope']);
  });

  it('resolves through the display-text form', () => {
    expect(findUnresolvedLinks(client, '[[Opula 유료화 전략|그 결정]]')).toEqual([]);
  });

  it('ignores a heading anchor on the target', () => {
    expect(findUnresolvedLinks(client, '[[Opula 유료화 전략#배경]]')).toEqual([]);
  });

  it('reports each dead target once', () => {
    expect(findUnresolvedLinks(client, '[[1234]] then [[1234]] again')).toEqual(['1234']);
  });

  it('returns nothing when the content has no links', () => {
    expect(findUnresolvedLinks(client, 'plain prose')).toEqual([]);
  });
});

describe('note_links source column', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-links-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('has a source column defaulting to wiki', () => {
    const cols = client.sqlite.prepare('PRAGMA table_info(note_links)').all() as {
      name: string;
      dflt_value: string | null;
    }[];
    const sourceCol = cols.find((c) => c.name === 'source');
    expect(sourceCol).toBeDefined();
    expect(sourceCol?.dflt_value).toContain('wiki');
  });

  it('syncLinks writes rows with source=wiki', () => {
    const target = insertNote(client, {
      title: 'Target',
      content: 'x',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'past',
    });
    const src = insertNote(client, {
      title: 'Source',
      content: 'points at [[Target]]',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'past',
    });
    syncLinks(client, src.id, src.content);

    const rows = client.sqlite
      .prepare('SELECT source FROM note_links WHERE source_id = ? AND target_id = ?')
      .all(src.id, target.id) as { source: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('wiki');
  });

  it('syncLinks does not delete non-wiki links when re-syncing', () => {
    const target = insertNote(client, {
      title: 'Target',
      content: 'x',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'past',
    });
    const src = insertNote(client, {
      title: 'Source',
      content: 'no link yet',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'past',
    });
    client.sqlite
      .prepare("INSERT INTO note_links(source_id, target_id, source) VALUES (?, ?, 'flashback')")
      .run(src.id, target.id);

    syncLinks(client, src.id, src.content);

    const rows = client.sqlite
      .prepare('SELECT source FROM note_links WHERE source_id = ?')
      .all(src.id) as { source: string }[];
    expect(rows.some((r) => r.source === 'flashback')).toBe(true);
  });

  it('backlinks include both wiki and flashback sources', () => {
    const target = insertNote(client, {
      title: 'Target',
      content: 'x',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'past',
    });
    const src = insertNote(client, {
      title: 'Source',
      content: 'see [[Target]]',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'past',
    });
    syncLinks(client, src.id, src.content);

    const backlinks = getBacklinks(client, target.id);
    expect(backlinks.map((b) => b.id)).toContain(src.id);
  });
});

describe('resolveLinkTargets', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-links-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const addNote = (title: string, content = '') =>
    insertNote(client, {
      title,
      content,
      filePath: join(dbDir, `${encodeURIComponent(title)}.md`),
      source: 'manual',
      layer: 'past',
    });

  it('opens a link written against the title', () => {
    const target = addNote('auth decision');
    expect(resolveLinkTargets(client, ['auth decision']).get('auth decision')).toBe(target.id);
  });

  it('opens a link written against the filename, not just the title', () => {
    const slashed = addNote('Round-2/3 25/25 통과');
    const asked = addNote('앵커란 무엇인가요?');

    expect(
      resolveLinkTargets(client, ['Round-2／3 25／25 통과']).get('Round-2／3 25／25 통과'),
    ).toBe(slashed.id);
    expect(resolveLinkTargets(client, ['앵커란 무엇인가요']).get('앵커란 무엇인가요')).toBe(
      asked.id,
    );
  });

  it('prefers a note that actually carries the title over one whose filename matches', () => {
    const byFilename = addNote('plan?');
    const byTitle = addNote('plan');
    expect(resolveLinkTargets(client, ['plan']).get('plan')).toBe(byTitle.id);
    expect(byFilename.id).not.toBe(byTitle.id);
  });

  it('leaves a target nothing in the vault answers to unresolved', () => {
    addNote('auth decision');
    expect(resolveLinkTargets(client, ['a note nobody wrote']).size).toBe(0);
  });

  it('records the recovered link as a real edge, so it becomes a backlink', () => {
    const target = addNote('Round-2/3 25/25 통과');
    const source = addNote('later', 'see [[Round-2／3 25／25 통과]]');
    syncLinks(client, source.id, source.content);

    expect(getBacklinks(client, target.id).map((n) => n.id)).toEqual([source.id]);
  });
});

describe('findFlashbacks', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-flash-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const setCreatedAt = (id: number, ms: number) =>
    client.sqlite.prepare('UPDATE notes SET created_at = ? WHERE id = ?').run(ms, id);

  const setAuthoredAt = (id: number, ms: number) =>
    client.sqlite.prepare('UPDATE notes SET authored_at = ? WHERE id = ?').run(ms, id);

  const fakeEmbedding = new Array(768).fill(0.1);

  // A unit vector the given euclidean distance from [1, 0, 0, ...]:
  // for unit vectors, L2 = sqrt(2 - 2·cos).
  const vectorAt = (distance: number): number[] => {
    const cos = 1 - (distance * distance) / 2;
    const v = new Array(768).fill(0);
    v[0] = cos;
    v[1] = Math.sqrt(1 - cos * cos);
    return v;
  };

  const addNote = (title: string, category: string, embedding: number[], ageDays: number) => {
    const note = insertNote(client, {
      title,
      content: 'x',
      filePath: join(dbDir, `${title}.md`),
      source: 'manual',
      layer: 'past',
      category,
    });
    setCreatedAt(note.id, Date.now() - ageDays * 86_400_000);
    saveEmbedding(client, note.id, embedding);
    return note;
  };

  it('returns notes older than minDaysGap from a different category', () => {
    const now = Date.now();
    const old = insertNote(client, {
      title: 'old',
      content: 'x',
      filePath: join(dbDir, 'o.md'),
      source: 'manual',
      layer: 'past',
      category: 'memory',
    });
    setCreatedAt(old.id, now - 100 * 86_400_000);

    const fresh = insertNote(client, {
      title: 'fresh',
      content: 'x',
      filePath: join(dbDir, 'f.md'),
      source: 'manual',
      layer: 'past',
      category: 'projects',
    });
    saveEmbedding(client, old.id, fakeEmbedding);
    saveEmbedding(client, fresh.id, fakeEmbedding);

    const flashbacks = findFlashbacks(client, fresh.id, now);
    expect(flashbacks.map((f) => f.id)).toContain(old.id);
    const oldFlash = flashbacks.find((f) => f.id === old.id);
    expect(oldFlash?.daysAgo).toBeGreaterThanOrEqual(90);
  });

  it('looks past the nearest neighbours, which are always the recent ones', () => {
    const now = Date.now();
    const source = addNote('source', 'projects', vectorAt(0), 0);
    for (let i = 0; i < 30; i += 1) {
      addNote(`recent-${i}`, 'projects', vectorAt(0.05 + i * 0.001), 1);
    }
    const old = addNote('old', 'writing', vectorAt(0.45), 200);

    expect(findFlashbacks(client, source.id, now).map((f) => f.id)).toContain(old.id);
    expect(findFlashbacks(client, source.id, now, { pool: 5 }).map((f) => f.id)).not.toContain(
      old.id,
    );
  });

  it('leaves out a note too far away to be about the same thing', () => {
    const now = Date.now();
    const source = addNote('source', 'projects', vectorAt(0), 0);
    const near = addNote('near', 'writing', vectorAt(0.45), 200);
    const far = addNote('far', 'writing', vectorAt(0.7), 200);

    const found = findFlashbacks(client, source.id, now).map((f) => f.id);
    expect(found).toContain(near.id);
    expect(found).not.toContain(far.id);
  });

  it('excludes notes in the same category as the source', () => {
    const now = Date.now();
    const old = insertNote(client, {
      title: 'same-cat-old',
      content: 'x',
      filePath: join(dbDir, 'so.md'),
      source: 'manual',
      layer: 'past',
      category: 'projects',
    });
    setCreatedAt(old.id, now - 200 * 86_400_000);

    const fresh = insertNote(client, {
      title: 'fresh',
      content: 'x',
      filePath: join(dbDir, 'f.md'),
      source: 'manual',
      layer: 'past',
      category: 'projects',
    });
    saveEmbedding(client, old.id, fakeEmbedding);
    saveEmbedding(client, fresh.id, fakeEmbedding);

    const flashbacks = findFlashbacks(client, fresh.id, now);
    expect(flashbacks.map((f) => f.id)).not.toContain(old.id);
  });

  it('excludes notes younger than the cutoff', () => {
    const now = Date.now();
    const recent = insertNote(client, {
      title: 'recent',
      content: 'x',
      filePath: join(dbDir, 'r.md'),
      source: 'manual',
      layer: 'past',
      category: 'memory',
    });
    setCreatedAt(recent.id, now - 10 * 86_400_000);

    const fresh = insertNote(client, {
      title: 'fresh',
      content: 'x',
      filePath: join(dbDir, 'f.md'),
      source: 'manual',
      layer: 'past',
      category: 'projects',
    });
    saveEmbedding(client, recent.id, fakeEmbedding);
    saveEmbedding(client, fresh.id, fakeEmbedding);

    const flashbacks = findFlashbacks(client, fresh.id, now);
    expect(flashbacks.map((f) => f.id)).not.toContain(recent.id);
  });

  it('respects custom minDaysGap and limit options', () => {
    const now = Date.now();
    const a = insertNote(client, {
      title: 'A',
      content: 'x',
      filePath: join(dbDir, 'a.md'),
      source: 'manual',
      layer: 'past',
      category: 'memory',
    });
    setCreatedAt(a.id, now - 40 * 86_400_000);

    const fresh = insertNote(client, {
      title: 'fresh',
      content: 'x',
      filePath: join(dbDir, 'f.md'),
      source: 'manual',
      layer: 'past',
      category: 'projects',
    });
    saveEmbedding(client, a.id, fakeEmbedding);
    saveEmbedding(client, fresh.id, fakeEmbedding);

    const flashbacks = findFlashbacks(client, fresh.id, now, { minDaysGap: 30, limit: 1 });
    expect(flashbacks).toHaveLength(1);
    expect(flashbacks[0].id).toBe(a.id);
  });

  it('measures the gap from authored_at when present (freshly imported old note)', () => {
    const now = Date.now();
    const imported = insertNote(client, {
      title: 'imported-old',
      content: 'x',
      filePath: join(dbDir, 'i.md'),
      source: 'index',
      layer: 'past',
      category: 'memory',
    });
    // created_at = import time (now), but the thought is 100 days old
    setAuthoredAt(imported.id, now - 100 * 86_400_000);

    const fresh = insertNote(client, {
      title: 'fresh',
      content: 'x',
      filePath: join(dbDir, 'f.md'),
      source: 'manual',
      layer: 'past',
      category: 'projects',
    });
    saveEmbedding(client, imported.id, fakeEmbedding);
    saveEmbedding(client, fresh.id, fakeEmbedding);

    const flashbacks = findFlashbacks(client, fresh.id, now);
    const flash = flashbacks.find((f) => f.id === imported.id);
    expect(flash).toBeDefined();
    expect(flash?.daysAgo).toBeGreaterThanOrEqual(90);
  });

  it('excludes a note whose authored_at is recent even if created_at is old', () => {
    const now = Date.now();
    const note = insertNote(client, {
      title: 'recently-authored',
      content: 'x',
      filePath: join(dbDir, 'ra.md'),
      source: 'manual',
      layer: 'past',
      category: 'memory',
    });
    setCreatedAt(note.id, now - 200 * 86_400_000);
    setAuthoredAt(note.id, now - 10 * 86_400_000);

    const fresh = insertNote(client, {
      title: 'fresh',
      content: 'x',
      filePath: join(dbDir, 'f.md'),
      source: 'manual',
      layer: 'past',
      category: 'projects',
    });
    saveEmbedding(client, note.id, fakeEmbedding);
    saveEmbedding(client, fresh.id, fakeEmbedding);

    const flashbacks = findFlashbacks(client, fresh.id, now);
    expect(flashbacks.map((f) => f.id)).not.toContain(note.id);
  });
});

describe('searchNotes — substring and link-expansion arms', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-arms-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const fakeEmbedding = new Array(768).fill(0.1);

  it('narrows to one layer when asked, across every arm', () => {
    const believed = insertNote(client, {
      title: 'auth approach',
      content: 'we use JWT',
      filePath: join(dbDir, 'state.md'),
      source: 'manual',
      layer: 'state',
      tags: serializeTags(['auth']),
    });
    const recorded = insertNote(client, {
      title: 'auth approach retro',
      content: 'we use JWT',
      filePath: join(dbDir, 'past.md'),
      source: 'manual',
      layer: 'past',
      tags: serializeTags(['auth']),
    });
    saveEmbedding(client, believed.id, fakeEmbedding);
    saveEmbedding(client, recorded.id, fakeEmbedding);

    const found = searchNotes(client, 'auth', fakeEmbedding, 10, { layer: 'state' }).map(
      (r) => r.id,
    );
    expect(found).toContain(believed.id);
    expect(found).not.toContain(recorded.id);
  });

  it("can look at one person's memories without an agent's working notes", () => {
    const mine = insertNote(client, {
      title: 'opula pricing',
      content: 'we picked two tiers',
      filePath: join(dbDir, 'mine.md'),
      source: 'manual',
      layer: 'state',
    });
    const theirs = insertNote(client, {
      title: 'opula-pricing-drivers',
      content: 'we picked two tiers',
      filePath: join(dbDir, 'memory', 'theirs.md'),
      source: 'index',
      layer: 'state',
      author: 'agent',
    });
    saveEmbedding(client, mine.id, fakeEmbedding);
    saveEmbedding(client, theirs.id, fakeEmbedding);

    const found = searchNotes(client, 'opula', fakeEmbedding, 10, { author: 'person' }).map(
      (r) => r.id,
    );
    expect(found).toContain(mine.id);
    expect(found).not.toContain(theirs.id);
  });

  it('matches inside agglutinated Korean words (substring arm)', () => {
    const note = insertNote(client, {
      title: '어제 한 일',
      content: '오후 내내 검색했다',
      filePath: join(dbDir, 'k.md'),
      source: 'manual',
      layer: 'past',
    });

    const results = searchNotes(client, '검색', fakeEmbedding, 5);
    expect(results.map((r) => r.id)).toContain(note.id);
  });

  it('pulls 1-hop linked neighbours of top candidates into the results', () => {
    const hit = insertNote(client, {
      title: 'auth architecture decision',
      content: 'we picked JWT',
      filePath: join(dbDir, 'hit.md'),
      source: 'manual',
      layer: 'past',
    });
    const neighbour = insertNote(client, {
      title: '회의 기록',
      content: '관련 후속 논의',
      filePath: join(dbDir, 'n.md'),
      source: 'manual',
      layer: 'past',
    });
    const unrelated = insertNote(client, {
      title: '점심 메뉴',
      content: '김치찌개',
      filePath: join(dbDir, 'u.md'),
      source: 'manual',
      layer: 'past',
    });
    client.sqlite
      .prepare("INSERT INTO note_links(source_id, target_id, source) VALUES (?, ?, 'wiki')")
      .run(neighbour.id, hit.id);

    const results = searchNotes(client, 'auth architecture', fakeEmbedding, 5);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(hit.id);
    expect(ids).toContain(neighbour.id);
    expect(ids.indexOf(hit.id)).toBeLessThan(ids.indexOf(neighbour.id));
    expect(ids).not.toContain(unrelated.id);
  });

  it('attaches an FTS match snippet around the matched term', () => {
    const note = insertNote(client, {
      title: 'meeting notes',
      content: `${'filler '.repeat(100)}the quorum decision was postponed until friday`,
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'past',
    });

    const results = searchNotes(client, 'quorum', fakeEmbedding, 5);
    const hit = results.find((r) => r.id === note.id);
    expect(hit?.matchSnippet).toContain('quorum');
    expect(hit?.matchSnippet?.length ?? 0).toBeLessThan(note.content.length);
  });

  it('returns camelCase timestamps from raw-row search arms', () => {
    const note = insertNote(client, {
      title: 'timestamp check',
      content: 'raw row normalization',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'past',
    });

    const results = searchNotes(client, 'normalization', fakeEmbedding, 5);
    const hit = results.find((r) => r.id === note.id);
    expect(hit?.createdAt).toBeTypeOf('number');
    expect(Number.isFinite(hit?.createdAt)).toBe(true);
    expect(new Date(hit?.authoredAt ?? hit?.createdAt ?? Number.NaN).toISOString()).toBeTruthy();
  });
});

describe('searchNotes — inflected Korean', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-prefix-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const far = new Array(768).fill(0);

  const add = (title: string, content: string, file: string) => {
    const note = insertNote(client, {
      title,
      content,
      filePath: join(dbDir, file),
      source: 'manual',
      layer: 'past',
    });
    saveEmbedding(client, note.id, far);
    return note;
  };

  it('finds a note whose query token only ever appears with a particle attached', () => {
    const inflected = add('조사가 붙은 노트', '이것이 근거는 아니다', 'k.md');
    expect(searchNotes(client, '근거', far, 5).map((r) => r.id)).toContain(inflected.id);
  });

  it('finds an English match that only appears in a longer inflected form', () => {
    const inflected = add('plural only', 'the protocols themselves', 'p.md');
    expect(searchNotes(client, 'protocol', far, 5).map((r) => r.id)).toContain(inflected.id);
  });
});

describe('searchNotes date filters', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-search-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const fakeEmbedding = new Array(768).fill(0.1);
  const DAY = 86_400_000;

  it('filters on authored_at when present, falling back to created_at', () => {
    const now = Date.now();
    // Authored 100 days ago, imported just now.
    const importedOld = insertNote(client, {
      title: 'april retro',
      content: 'x',
      filePath: join(dbDir, 'a.md'),
      source: 'index',
      layer: 'past',
      authoredAt: now - 100 * DAY,
    });
    // No authored_at — created_at (now) is the effective date.
    const freshNote = insertNote(client, {
      title: 'april retro follow-up',
      content: 'x',
      filePath: join(dbDir, 'b.md'),
      source: 'manual',
      layer: 'past',
    });
    saveEmbedding(client, importedOld.id, fakeEmbedding);
    saveEmbedding(client, freshNote.id, fakeEmbedding);

    const oldWindow = searchNotes(client, 'april retro', fakeEmbedding, 10, {
      dateFrom: now - 110 * DAY,
      dateTo: now - 90 * DAY,
    });
    expect(oldWindow.map((r) => r.id)).toContain(importedOld.id);
    expect(oldWindow.map((r) => r.id)).not.toContain(freshNote.id);

    const recentWindow = searchNotes(client, 'april retro', fakeEmbedding, 10, {
      dateFrom: now - 1 * DAY,
    });
    expect(recentWindow.map((r) => r.id)).toContain(freshNote.id);
    expect(recentWindow.map((r) => r.id)).not.toContain(importedOld.id);
  });
});

describe('state recency tiebreaker', () => {
  let dbDir: string;
  let client: MemexClient;
  const embA = new Array(768).fill(0.1); // close to query
  const embFar = new Array(768).fill(0.9); // far from query

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-recency-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('breaks a tie in favour of the fresher state note', () => {
    // Identical title/content/embedding → every arm scores them equally.
    // Only layer differs, so the state-recency factor is the sole tiebreaker.
    const pastNote = insertNote(client, {
      title: 'alpha beta plan',
      content: 'alpha beta plan body',
      filePath: join(dbDir, 'past.md'),
      source: 'manual',
      layer: 'past',
    });
    const stateNote = insertNote(client, {
      title: 'alpha beta plan',
      content: 'alpha beta plan body',
      filePath: join(dbDir, 'state.md'),
      source: 'manual',
      layer: 'state',
    });
    saveEmbedding(client, pastNote.id, embA);
    saveEmbedding(client, stateNote.id, embA);

    const results = searchNotes(client, 'alpha beta plan', embA, 5);
    expect(results[0].id).toBe(stateNote.id);
  });

  it('does not overtake a clearly more relevant note', () => {
    // A: past but a strong multi-arm match (vector rank0 + fts + title + substring).
    // B: state + fresh but only a weak, distant vector hit.
    // The 6% recency factor must not flip A and B.
    const strongPast = insertNote(client, {
      title: 'alpha beta plan',
      content: 'alpha beta plan body',
      filePath: join(dbDir, 'strong.md'),
      source: 'manual',
      layer: 'past',
    });
    const weakState = insertNote(client, {
      title: 'zzz qqq',
      content: 'zzz qqq unrelated',
      filePath: join(dbDir, 'weak.md'),
      source: 'manual',
      layer: 'state',
    });
    saveEmbedding(client, strongPast.id, embA);
    saveEmbedding(client, weakState.id, embFar);

    const results = searchNotes(client, 'alpha beta plan', embA, 5);
    expect(results[0].id).toBe(strongPast.id);
  });
});
