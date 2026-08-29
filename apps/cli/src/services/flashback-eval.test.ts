import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertNote, type MemexClient, openDb, serializeTags, syncLinks } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateFlashback, linkedPairs } from './flashback-eval.ts';

const DAY = 86_400_000;

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-fbeval-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, category: string | null, ageDays: number, content = 'x') => {
  const note = insertNote(client, {
    title,
    content,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer: 'past',
    category,
    tags: serializeTags([]),
  });
  client.sqlite
    .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
    .run(Date.now() - ageDays * DAY, note.id);
  return note;
};

describe('linkedPairs', () => {
  it('measures the gap and the folder crossing of every link you wrote', () => {
    const old = addNote('old', 'writing', 200);
    const fresh = addNote('fresh', 'projects', 0, 'see [[old]]');
    syncLinks(client, fresh.id, fresh.content);

    const [pair] = linkedPairs(client);
    expect(pair).toMatchObject({ source: fresh.id, target: old.id, crossFolder: true });
    expect(pair.daysApart).toBeGreaterThanOrEqual(199);
  });

  it('counts a note outside any folder as crossing one', () => {
    const loose = addNote('loose', null, 10);
    const fresh = addNote('fresh', 'projects', 0, 'see [[loose]]');
    syncLinks(client, fresh.id, fresh.content);

    expect(linkedPairs(client)[0]).toMatchObject({ target: loose.id, crossFolder: true });
  });
});

describe('evaluateFlashback', () => {
  it('reports on an empty vault without dividing by zero', () => {
    const report = evaluateFlashback(client, {
      minDaysGap: 90,
      pools: [15, 500],
      caps: [0.4, 0.5],
      sample: 10,
    });
    expect(report.links).toEqual({ total: 0, backward: 0, shaped: 0 });
    expect(report.pools.map((p) => p.pool)).toEqual([15, 500]);
    expect(report.caps.every((c) => c.medianCandidates === 0)).toBe(true);
  });
});
