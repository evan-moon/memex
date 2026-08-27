import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { countRetrievals, logRetrieval, retrievalCounts } from './retrieval-log.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-retrieval-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('logRetrieval', () => {
  it('records one row per note, ranked from 1 in result order', () => {
    logRetrieval(client, { query: '근거', surface: 'mcp', noteIds: [7, 3, 9] }, 1000);
    const rows = client.sqlite
      .prepare(
        'SELECT note_id AS noteId, rank, surface, query, at FROM retrieval_log ORDER BY rank',
      )
      .all();
    expect(rows).toEqual([
      { noteId: 7, rank: 1, surface: 'mcp', query: '근거', at: 1000 },
      { noteId: 3, rank: 2, surface: 'mcp', query: '근거', at: 1000 },
      { noteId: 9, rank: 3, surface: 'mcp', query: '근거', at: 1000 },
    ]);
  });

  it('writes nothing when a search returned no results', () => {
    logRetrieval(client, { query: '없는 것', surface: 'cli', noteIds: [] });
    expect(countRetrievals(client)).toBe(0);
  });

  it('counts how often each note was actually retrieved', () => {
    logRetrieval(client, { query: 'a', surface: 'mcp', noteIds: [1, 2] }, 10);
    logRetrieval(client, { query: 'b', surface: 'ui', noteIds: [2, 3] }, 20);
    logRetrieval(client, { query: 'c', surface: 'mcp', noteIds: [2] }, 30);
    expect(retrievalCounts(client)).toEqual([
      { noteId: 2, hits: 3, lastAt: 30 },
      { noteId: 3, hits: 1, lastAt: 20 },
      { noteId: 1, hits: 1, lastAt: 10 },
    ]);
  });

  it('can count only what was retrieved since a cutoff', () => {
    logRetrieval(client, { query: 'old', surface: 'mcp', noteIds: [1] }, 10);
    logRetrieval(client, { query: 'new', surface: 'mcp', noteIds: [2] }, 100);
    expect(retrievalCounts(client, { since: 50 })).toEqual([{ noteId: 2, hits: 1, lastAt: 100 }]);
  });

  it('records who asked, so the daemon can be told from a person', () => {
    logRetrieval(client, { query: 'a', surface: 'cli', noteIds: [1] }, 10);
    logRetrieval(client, { query: 'b', surface: 'ui', noteIds: [2] }, 20);
    logRetrieval(client, { query: 'c', surface: 'mcp', noteIds: [3] }, 30);
    logRetrieval(client, { query: 'd', surface: 'recall', noteIds: [4] }, 40);

    const rows = client.sqlite
      .prepare('SELECT surface, initiator FROM retrieval_log ORDER BY at')
      .all();
    expect(rows).toEqual([
      { surface: 'cli', initiator: 'user_explicit' },
      { surface: 'ui', initiator: 'user_explicit' },
      { surface: 'mcp', initiator: 'agent_assisted' },
      { surface: 'recall', initiator: 'daemon' },
    ]);
  });

  it('counts only the attention it was asked to stand for', () => {
    logRetrieval(client, { query: 'a', surface: 'recall', noteIds: [1] }, 10);
    logRetrieval(client, { query: 'a', surface: 'recall', noteIds: [1] }, 20);
    logRetrieval(client, { query: 'b', surface: 'cli', noteIds: [2] }, 30);

    expect(retrievalCounts(client, { initiators: ['user_explicit'] })).toEqual([
      { noteId: 2, hits: 1, lastAt: 30 },
    ]);
    expect(retrievalCounts(client)).toHaveLength(2);
  });

  it('keeps every occurrence so frequency reflects repeated retrieval', () => {
    logRetrieval(client, { query: 'a', surface: 'mcp', noteIds: [5] }, 10);
    logRetrieval(client, { query: 'a', surface: 'mcp', noteIds: [5] }, 20);
    expect(countRetrievals(client)).toBe(2);
  });
});
