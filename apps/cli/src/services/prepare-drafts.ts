import {
  basisOf,
  draftedNotes,
  dropDraft,
  getNote,
  listSignals,
  type MemexClient,
  putDraft,
} from '@memex/db';
import { draftStateUpdate } from './draft.ts';
import { bodyOf } from './ui/notes.ts';

export type Prepared = {
  drafted: number[];
  skipped: { id: number; why: 'fresh-draft' | 'no-evidence' | 'gone' }[];
  failed: { id: number; error: string }[];
  swept: number;
};

/**
 * Writes the rewrite before anyone presses for it.
 *
 * The person's job in this product is judgement, and judgement does not survive
 * a two minute wait between the question and the answer. Drafting ahead moves
 * that wait off the session and out of the hours nobody is looking.
 *
 * It only ever prepares. Nothing here writes a note: the draft sits until a
 * person approves it, because the one thing this product will not do is let the
 * model rewrite what the model wrote.
 */
export const prepareDrafts = async (
  client: MemexClient,
  limit: number,
  onStep?: (note: { id: number; title: string }) => void,
): Promise<Prepared> => {
  const out: Prepared = { drafted: [], skipped: [], failed: [], swept: 0 };

  // A draft whose note or evidence has moved is about a question nobody is
  // asking. Clearing it here keeps the store from growing a museum.
  for (const noteId of draftedNotes(client)) {
    if (getNote(client, noteId) === undefined) {
      dropDraft(client, noteId);
      out.swept++;
    }
  }

  const open = listSignals(client, { type: 'stale_state', status: 'new' });

  for (const signal of open) {
    if (out.drafted.length >= limit) break;

    const id = signal.evidenceIds[0];
    const note = getNote(client, id);
    if (!note) {
      out.skipped.push({ id, why: 'gone' });
      continue;
    }

    const newer = signal.evidenceIds.slice(1).flatMap((otherId) => {
      const other = getNote(client, otherId);
      return other ? [other] : [];
    });
    if (newer.length === 0) {
      out.skipped.push({ id, why: 'no-evidence' });
      continue;
    }

    onStep?.({ id: note.id, title: note.title });

    const draft = await draftStateUpdate({
      title: note.title,
      body: bodyOf(note.content, note.title),
      since: new Date(note.updatedAt).toISOString().slice(0, 10),
      newer: newer.map((other) => ({
        id: other.id,
        title: other.title,
        body: bodyOf(other.content, other.title),
      })),
    });

    if ('error' in draft) {
      out.failed.push({ id, error: draft.error });
      continue;
    }

    putDraft(client, id, {
      body: draft.body,
      changes: draft.changes,
      verdict: draft.verdict,
      noteContent: note.content,
      basis: basisOf(newer.map((other) => ({ id: other.id, content: other.content }))),
    });
    out.drafted.push(id);
  }

  return out;
};
