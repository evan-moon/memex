import type { MemexClient } from './client.ts';

export type RetrievalSurface = 'mcp' | 'cli' | 'ui' | 'recall';

export type RetrievalInitiator = 'user_explicit' | 'agent_assisted' | 'daemon';

// `cli` and `ui` carry a query the user typed. `mcp` carries one the agent chose
// on their behalf mid-conversation — driven by their intent, but not their words.
// `recall` carries neither: it fires on every prompt whether or not anyone wanted
// to look something up.
const initiatorBySurface: Record<RetrievalSurface, RetrievalInitiator> = {
  cli: 'user_explicit',
  ui: 'user_explicit',
  mcp: 'agent_assisted',
  recall: 'daemon',
};

export type RetrievalEntry = {
  query: string;
  surface: RetrievalSurface;
  noteIds: number[];
  injectedIds?: number[];
};

export type RetrievalCount = {
  noteId: number;
  hits: number;
  lastAt: number;
};

export const logRetrieval = (client: MemexClient, entry: RetrievalEntry, at = Date.now()) => {
  if (entry.noteIds.length === 0) return;
  const initiator = initiatorBySurface[entry.surface];
  const injected = new Set(entry.injectedIds ?? entry.noteIds);
  const insert = client.sqlite.prepare(
    `INSERT INTO retrieval_log (query, note_id, rank, surface, initiator, injected, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  client.sqlite.transaction(() => {
    entry.noteIds.forEach((noteId, index) => {
      insert.run(
        entry.query,
        noteId,
        index + 1,
        entry.surface,
        initiator,
        injected.has(noteId) ? 1 : 0,
        at,
      );
    });
  })();
};

export type RetrievalCountOptions = { since?: number; initiators?: RetrievalInitiator[] };

// Counting every row answers "what did the daemon walk past", which is not a
// question anyone asked. Pass the initiators whose attention the count is meant
// to stand for.
export const retrievalCounts = (
  client: MemexClient,
  options: RetrievalCountOptions = {},
): RetrievalCount[] => {
  const where = [
    options.since === undefined ? '' : 'at >= ?',
    options.initiators === undefined
      ? ''
      : `initiator IN (${options.initiators.map(() => '?').join(',')})`,
  ].filter(Boolean);

  return client.sqlite
    .prepare(
      `SELECT note_id AS noteId, COUNT(*) AS hits, MAX(at) AS lastAt
       FROM retrieval_log
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY note_id
       ORDER BY hits DESC, lastAt DESC`,
    )
    .all(
      ...(options.since === undefined ? [] : [options.since]),
      ...(options.initiators ?? []),
    ) as RetrievalCount[];
};

export const countRetrievals = (client: MemexClient) =>
  (client.sqlite.prepare('SELECT COUNT(*) AS n FROM retrieval_log').get() as { n: number }).n;
