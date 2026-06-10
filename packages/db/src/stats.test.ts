import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { insertNote } from './repository.ts';
import { getCorpusStats, getFlashbackStats } from './stats.ts';

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
