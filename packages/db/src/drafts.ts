import type { MemexClient } from './client.ts';
import { bodyHash } from './evidence.ts';

/**
 * A rewrite prepared before anyone asked for it.
 *
 * The point is the person's time, not the machine's. Drafting takes a minute or
 * two, and a review session that stops for that after every press is not a
 * session. Written ahead, the press is instant and the person only ever judges.
 */
export type DraftChange = { text: string; from: number[] };

export type NoteDraft = {
  noteId: number;
  body: string;
  /** What the screen shows under the diff: one line per thing that moved. */
  changes: DraftChange[];
  verdict: string;
  createdAt: number;
};

type Row = {
  note_id: number;
  body: string;
  changes: string;
  verdict: string;
  note_hash: string;
  basis: string;
  created_at: number;
};

/** What made the draft worth writing: the sources it answers, as they read then. */
export const basisOf = (sources: { id: number; content: string }[]): string =>
  sources
    .map((source) => `${source.id}:${bodyHash(source.content)}`)
    .sort()
    .join(' ');

export const putDraft = (
  client: MemexClient,
  noteId: number,
  draft: {
    body: string;
    changes: DraftChange[];
    verdict: string;
    noteContent: string;
    basis: string;
  },
): void => {
  client.sqlite
    .prepare(
      `INSERT INTO note_drafts (note_id, body, changes, verdict, note_hash, basis, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(note_id) DO UPDATE SET
         body = excluded.body, changes = excluded.changes, verdict = excluded.verdict,
         note_hash = excluded.note_hash, basis = excluded.basis,
         created_at = excluded.created_at`,
    )
    .run(
      noteId,
      draft.body,
      JSON.stringify(draft.changes),
      draft.verdict,
      bodyHash(draft.noteContent),
      draft.basis,
      Date.now(),
    );
};

/**
 * A draft only counts while it is still about the note it was written for. If
 * the note has been rewritten since, or the evidence that prompted it has
 * moved, what is stored answers a question nobody is asking any more — and
 * showing it as ready would put the person's approval on the wrong text.
 */
export const getDraft = (
  client: MemexClient,
  noteId: number,
  now: { noteContent: string; basis: string },
): NoteDraft | null => {
  const row = client.sqlite.prepare('SELECT * FROM note_drafts WHERE note_id = ?').get(noteId) as
    | Row
    | undefined;
  if (!row) return null;
  if (row.note_hash !== bodyHash(now.noteContent) || row.basis !== now.basis) return null;

  const changes = ((): DraftChange[] => {
    try {
      return JSON.parse(row.changes) as DraftChange[];
    } catch {
      return [];
    }
  })();

  return {
    noteId: row.note_id,
    body: row.body,
    changes,
    verdict: row.verdict,
    createdAt: row.created_at,
  };
};

export const dropDraft = (client: MemexClient, noteId: number): void => {
  client.sqlite.prepare('DELETE FROM note_drafts WHERE note_id = ?').run(noteId);
};

export const draftedNotes = (client: MemexClient): number[] =>
  (client.sqlite.prepare('SELECT note_id FROM note_drafts').all() as { note_id: number }[]).map(
    (row) => row.note_id,
  );
