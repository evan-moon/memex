import {
  basisOf,
  draftedNotes,
  dropDraft,
  getNote,
  listSignals,
  type MemexClient,
  putDraft,
} from '@memex/db';
import type { LlmChoice } from '@memex/llm';
import { draftStateUpdate } from './draft.ts';
import { bodyOf } from './ui/notes.ts';

export type Prepared = {
  drafted: number[];
  skipped: { id: number; why: 'fresh-draft' | 'no-evidence' | 'gone' }[];
  failed: { id: number; error: string }[];
  swept: number;
};

/**
 * Writes the rewrites for a review session, so the reading is over before the
 * judging starts.
 *
 * The trigger is the session, never a clock. A laptop is not a server and a
 * schedule that assumes it is only ever runs on the days it happens to be
 * awake — and worse, it spends the model on work nobody asked for. This runs
 * when the person says they want to fix something.
 *
 * `choice` is theirs too. Drafting is the one call whose output they are asked
 * to approve, so which model wrote it is not the code's decision.
 *
 * It only ever prepares. Nothing here writes a note: the draft sits until a
 * person approves it, because the one thing this product will not do is let the
 * model rewrite what the model wrote.
 */
export const prepareDrafts = async (
  client: MemexClient,
  limit: number,
  options: { choice?: LlmChoice; onStep?: (note: { id: number; title: string }) => void } = {},
): Promise<Prepared> => {
  const { choice, onStep } = options;
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

    const draft = await draftStateUpdate(
      {
        title: note.title,
        body: bodyOf(note.content, note.title),
        since: new Date(note.updatedAt).toISOString().slice(0, 10),
        newer: newer.map((other) => ({
          id: other.id,
          title: other.title,
          body: bodyOf(other.content, other.title),
        })),
      },
      choice,
    );

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
