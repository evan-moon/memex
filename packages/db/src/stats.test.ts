import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { syncNoteFacets } from './facets.ts';
import { insertNote } from './repository.ts';
import { getCorpusStats, getFlashbackStats, getLabelEvidence } from './stats.ts';

describe('flashback stats', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-stats-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const addNote = (title: string) =>
    insertNote(client, {
      title,
      content: 'x',
      filePath: join(dbDir, `${title}.md`),
      source: 'manual',
      layer: 'past',
    });

  const link = (sourceId: number, targetId: number, source: 'wiki' | 'flashback') =>
    client.sqlite
      .prepare('INSERT INTO note_links(source_id, target_id, source) VALUES (?, ?, ?)')
      .run(sourceId, targetId, source);

  it('reports null adoption rate when no flashbacks exist', () => {
    const stats = getFlashbackStats(client);
    expect(stats.total).toBe(0);
    expect(stats.adoptionRate).toBeNull();
  });

  it('counts a flashback pair as adopted once a wiki link exists in either direction', () => {
    const a = addNote('a');
    const b = addNote('b');
    const c = addNote('c');

    link(a.id, b.id, 'flashback'); // adopted via reverse wiki link
    link(b.id, a.id, 'wiki');
    link(a.id, c.id, 'flashback'); // never cited

    const stats = getFlashbackStats(client);
    expect(stats.total).toBe(2);
    expect(stats.adopted).toBe(1);
    expect(stats.adoptionRate).toBeCloseTo(0.5);
  });

  it('ranks the most resurfaced flashback targets', () => {
    const a = addNote('a');
    const b = addNote('b');
    const old = addNote('old-insight');

    link(a.id, old.id, 'flashback');
    link(b.id, old.id, 'flashback');
    link(a.id, b.id, 'flashback');

    const stats = getFlashbackStats(client);
    expect(stats.topResurfaced[0]).toMatchObject({ id: old.id, title: 'old-insight', count: 2 });
  });

  it('aggregates corpus counts by layer and link source', () => {
    const a = addNote('a');
    const b = addNote('b');
    link(a.id, b.id, 'wiki');

    const stats = getCorpusStats(client);
    expect(stats.notes).toBe(2);
    expect(stats.notesByLayer).toEqual([{ key: 'past', count: 2 }]);
    expect(stats.linksBySource).toEqual([{ key: 'wiki', count: 1 }]);
  });
});

describe('label evidence', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-labels-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const note = (title: string, type?: string) =>
    insertNote(client, {
      title,
      content: '평범한 첫 문단으로 시작하는 본문이라고 적어둔 줄이다.',
      filePath: join(dbDir, `${title}.md`),
      source: 'manual',
      layer: 'past',
      ...(type === undefined ? {} : { type: type as '제품작업' }),
    });

  const baseline = (noteId: number, confidence: '강' | '약') =>
    client.sqlite
      .prepare('INSERT INTO note_type_baseline (note_id, type, confidence) VALUES (?, ?, ?)')
      .run(noteId, '제품작업', confidence);

  it('says nothing to compare against when no baseline was ever taken', () => {
    const a = note('a');
    syncNoteFacets(client, a.id);
    const evidence = getLabelEvidence(client);
    expect(evidence.labelled).toBe(1);
    expect(evidence.againstBaseline).toBeNull();
  });

  it('compares only the notes both passes labelled', () => {
    const kept = note('kept', '제품작업');
    const alsoKept = note('also kept');
    syncNoteFacets(client, kept.id);
    syncNoteFacets(client, alsoKept.id);

    baseline(kept.id, '약');
    baseline(alsoKept.id, '약');
    // A note the baseline saw and the index no longer holds is not a comparison.
    baseline(9999, '강');

    expect(getLabelEvidence(client).againstBaseline).toEqual({
      shared: 2,
      thenStrong: 0,
      nowStrong: 1,
    });
  });

  it('counts a type the writer declared as strong evidence', () => {
    const declared = note('declared', '세션기록');
    const guessed = note('guessed');
    syncNoteFacets(client, declared.id);
    syncNoteFacets(client, guessed.id);

    const evidence = getLabelEvidence(client);
    expect(evidence.declared).toBe(1);
    expect(evidence.strong).toBe(1);
  });
});
