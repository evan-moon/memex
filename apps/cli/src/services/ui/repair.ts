import { indexTypeNoteIds, type MemexClient, notesDeclaringEvidence } from '@memex/db';
import { candidateSources, type NoteRef } from './notes.ts';

export type Undeclared = {
  id: number;
  title: string;
  candidates: number;
  layer: string;
  at: number;
  updatedAt: number;
};

export type RepairCard = {
  id: number;
  title: string;
  layer: string;
  at: number;
  updatedAt: number;
  candidates: NoteRef[];
};

export type RepairBatch = { remaining: number; cards: RepairCard[] };

// An index note asserts nothing of its own, so "what is this built on?" has no
// answer to give. Asking anyway is what made the widest cards the slowest.
export const undeclaredProjections = (client: MemexClient): Undeclared[] => {
  const skip = new Set([...notesDeclaringEvidence(client), ...indexTypeNoteIds(client)]);
  return (
    client.sqlite
      .prepare(
        `SELECT n.id, n.title, n.layer,
                COALESCE(n.authored_at, n.created_at) AS at,
                n.updated_at AS updatedAt,
                COUNT(l.target_id) AS candidates
         FROM notes n
         LEFT JOIN note_links l ON l.source_id = n.id AND l.source = 'wiki'
         WHERE n.layer = 'state' AND n.author = 'person'
         GROUP BY n.id
         ORDER BY candidates DESC, n.updated_at DESC`,
      )
      .all() as Undeclared[]
  ).filter((row) => !skip.has(row.id));
};

// A session hands over a bounded stack, not the whole backlog: the count that
// never moves is what turned the home screen into a second statistics board.
export const evidenceBatch = (client: MemexClient, limit: number): RepairBatch => {
  const servable = undeclaredProjections(client).filter((row) => row.candidates > 0);
  const cards = servable.slice(0, limit).map((row) => ({
    id: row.id,
    title: row.title,
    layer: row.layer,
    at: row.at,
    updatedAt: row.updatedAt,
    candidates: candidateSources(client, { id: row.id, layer: 'state' }),
  }));
  return { remaining: servable.length - cards.length, cards };
};
