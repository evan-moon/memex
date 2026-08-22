import type { MemexClient } from './client.ts';

export type RetrievalSurface = 'mcp' | 'cli' | 'ui' | 'recall';

export type RetrievalEntry = {
  query: string;
  surface: RetrievalSurface;
  noteIds: number[];
};

export type RetrievalCount = {
  noteId: number;
  hits: number;
  lastAt: number;
};

export const logRetrieval = (client: MemexClient, entry: RetrievalEntry, at = Date.now()) => {
  if (entry.noteIds.length === 0) return;
  const insert = client.sqlite.prepare(
    `INSERT INTO retrieval_log (query, note_id, rank, surface, at) VALUES (?, ?, ?, ?, ?)`,
  );
  client.sqlite.transaction(() => {
    entry.noteIds.forEach((noteId, index) => {
      insert.run(entry.query, noteId, index + 1, entry.surface, at);
    });
  })();
};

export const retrievalCounts = (client: MemexClient, since?: number): RetrievalCount[] =>
  client.sqlite
    .prepare(
      `SELECT note_id AS noteId, COUNT(*) AS hits, MAX(at) AS lastAt
       FROM retrieval_log
       ${since ? 'WHERE at >= ?' : ''}
       GROUP BY note_id
       ORDER BY hits DESC, lastAt DESC`,
    )
    .all(...(since ? [since] : [])) as RetrievalCount[];

export const countRetrievals = (client: MemexClient) =>
  (client.sqlite.prepare('SELECT COUNT(*) AS n FROM retrieval_log').get() as { n: number }).n;
