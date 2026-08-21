import { listSignals, type MemexClient } from '@memex/db';

export type NoteStatus =
  | { kind: 'amended'; by: { id: number; title: string } }
  | { kind: 'piled-up'; count: number }
  | { kind: 'recent' };

// A note is out of date for one of two reasons the vault already records: a
// later note corrected it, or it claims to be a current plan while newer
// records piled up behind it.
export const amendedStatuses = (client: MemexClient, ids: number[]): Map<number, NoteStatus> => {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = client.sqlite
    .prepare(
      `SELECT l.target_id AS id, n.id AS fixId, n.title AS fixTitle,
              COALESCE(n.authored_at, n.created_at) AS at
       FROM note_links l JOIN notes n ON n.id = l.source_id
       WHERE l.source = 'amends' AND l.target_id IN (${placeholders})
       ORDER BY at`,
    )
    .all(...ids) as { id: number; fixId: number; fixTitle: string }[];
  return rows.reduce(
    (acc, r) => acc.set(r.id, { kind: 'amended', by: { id: r.fixId, title: r.fixTitle } }),
    new Map<number, NoteStatus>(),
  );
};

export const piledUpStatuses = (client: MemexClient): Map<number, NoteStatus> =>
  listSignals(client, { type: 'stale_state', status: 'new' }).reduce((acc, s) => {
    const [stateNote, ...newer] = s.evidenceIds;
    return stateNote === undefined
      ? acc
      : acc.set(stateNote, { kind: 'piled-up', count: newer.length });
  }, new Map<number, NoteStatus>());

export const statusesFor = (client: MemexClient, ids: number[]): Map<number, NoteStatus> => {
  const amended = amendedStatuses(client, ids);
  const piledUp = piledUpStatuses(client);
  return ids.reduce((acc, id) => {
    const status = amended.get(id) ?? piledUp.get(id);
    return status ? acc.set(id, status) : acc;
  }, new Map<number, NoteStatus>());
};
