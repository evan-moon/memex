import type { MemexClient } from './client.ts';

export type ChatSession = { id: number; title: string; turns: number; lastAt: number };

export type ChatTurn = { id: number; said: string; outcome: string; at: number };

const TITLE_CHARS = 60;

// The first thing said names the conversation. Nothing generates a better one
// without asking a model what a conversation was about, which is a call nobody
// asked for and a cost every turn would pay.
const titleFrom = (said: string) =>
  said.length <= TITLE_CHARS ? said : `${said.slice(0, TITLE_CHARS)}…`;

export const startSession = (client: MemexClient, said: string, now = Date.now()): number => {
  const { lastInsertRowid } = client.sqlite
    .prepare('INSERT INTO chat_sessions (title, created_at, updated_at) VALUES (?, ?, ?)')
    .run(titleFrom(said), now, now);
  return Number(lastInsertRowid);
};

export const recordTurn = (
  client: MemexClient,
  sessionId: number,
  turn: { said: string; outcome: string },
  now = Date.now(),
): number => {
  const { lastInsertRowid } = client.sqlite
    .prepare('INSERT INTO chat_turns (session_id, said, outcome, created_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, turn.said, turn.outcome, now);
  client.sqlite.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  return Number(lastInsertRowid);
};

// A proposal is written down the moment it is made, and pressing it changes what
// that turn settled rather than adding a second one — the reader made one
// request, and a transcript that shows two is a transcript that lies about it.
export const restateTurn = (client: MemexClient, turnId: number, outcome: string): void => {
  client.sqlite.prepare('UPDATE chat_turns SET outcome = ? WHERE id = ?').run(outcome, turnId);
};

export const sessionTurns = (client: MemexClient, sessionId: number): ChatTurn[] =>
  client.sqlite
    .prepare(
      'SELECT id, said, outcome, created_at AS at FROM chat_turns WHERE session_id = ? ORDER BY id',
    )
    .all(sessionId) as ChatTurn[];

export const listSessions = (client: MemexClient, limit = 30): ChatSession[] =>
  client.sqlite
    .prepare(
      `SELECT s.id, s.title, s.updated_at AS lastAt, COUNT(t.id) AS turns
       FROM chat_sessions s LEFT JOIN chat_turns t ON t.session_id = s.id
       GROUP BY s.id
       HAVING turns > 0
       ORDER BY s.updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as ChatSession[];

export const deleteSession = (client: MemexClient, sessionId: number): boolean => {
  client.sqlite.prepare('DELETE FROM chat_turns WHERE session_id = ?').run(sessionId);
  return client.sqlite.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId).changes > 0;
};

export const sessionExists = (client: MemexClient, sessionId: number): boolean =>
  client.sqlite.prepare('SELECT 1 FROM chat_sessions WHERE id = ?').get(sessionId) !== undefined;
