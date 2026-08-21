import { type MemexClient, notesDeclaringEvidence } from '@memex/db';
import { type NoteRef, candidateSources } from './notes.ts';

export type Undeclared = { id: number; title: string; candidates: number };

export type RepairCard = { id: number; title: string; candidates: NoteRef[] };

export type RepairBatch = { remaining: number; cards: RepairCard[] };

export const undeclaredProjections = (client: MemexClient): Undeclared[] => {
  const declared = new Set(notesDeclaringEvidence(client));
  return (
    client.sqlite
      .prepare(
        `SELECT n.id, n.title, COUNT(l.target_id) AS candidates
         FROM notes n
         LEFT JOIN note_links l ON l.source_id = n.id AND l.source = 'wiki'
         WHERE n.layer = 'state' AND n.author = 'person'
         GROUP BY n.id
         ORDER BY candidates DESC, n.updated_at DESC`,
      )
      .all() as Undeclared[]
  ).filter((row) => !declared.has(row.id));
};

// A session hands over a bounded stack, not the whole backlog: the count that
// never moves is what turned the home screen into a second statistics board.
export const evidenceBatch = (client: MemexClient, limit: number): RepairBatch => {
  const rows = undeclaredProjections(client);
  return {
    remaining: rows.length,
    cards: rows
      .filter((row) => row.candidates > 0)
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        title: row.title,
        candidates: candidateSources(client, { id: row.id, layer: 'state' }),
      })),
  };
};
