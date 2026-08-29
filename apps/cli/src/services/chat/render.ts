import type { Plan } from './plan.ts';
import type { Candidates, Wrote } from './turn.ts';

const BODY_CHARS = 400;

export type NoteRef = { id: number; title: string };

// What a plan will do, said in the terms the reader is looking at: the value
// that is there now beside the one that would replace it, the note a correction
// is aimed at by its title rather than its id.
export type Preview =
  | {
      kind: 'register';
      subject: string;
      predicate: string;
      from: string[];
      to: string;
      newPredicate: boolean;
    }
  | { kind: 'amend'; target: NoteRef | null; title: string; body: string }
  | {
      kind: 'new-note';
      title: string;
      body: string;
      folder: string | null;
      layer: 'past' | 'state';
      tags: string[];
    }
  | { kind: 'rule'; rule: NoteRef | null; decision: 'approve' | 'decline' };

// What happened. Deliberately not the domain result: `Wrote` carries whole note
// rows, file paths and content included, and a receipt that hands the screen
// everything invites the screen to show it.
export type Receipt =
  | {
      kind: 'register';
      subject: string;
      predicate: string;
      // What the key said before. Writing it back is a new event, not a
      // retraction, so nothing built on this may call it a revert.
      previous: string[];
      value: string;
      newPredicate: boolean;
      // Keys that look like the one just written but were not merged with it.
      similar: string[];
    }
  | {
      kind: 'note';
      id: number;
      title: string;
      corrected: NoteRef | null;
      // Set when the note was saved and the correction did not attach — the one
      // outcome where part of what was asked for landed and part did not.
      unlinked: number | null;
    }
  | { kind: 'rule'; id: number; title: string; decision: 'approve' | 'decline' };

const clip = (body: string) => (body.length <= BODY_CHARS ? body : `${body.slice(0, BODY_CHARS)}…`);

const ref = (id: number, titles: Map<number, string>): NoteRef | null => {
  const title = titles.get(id);
  return title === undefined ? null : { id, title };
};

const titlesIn = (candidates: Candidates) =>
  new Map([
    ...candidates.notes.map((note): [number, string] => [note.id, note.title]),
    ...candidates.rules.map((rule): [number, string] => [rule.id, rule.title]),
  ]);

export const previewOf = (plan: Plan, candidates: Candidates): Preview => {
  if (plan.kind === 'set-register') {
    return {
      kind: 'register',
      subject: plan.subject,
      predicate: plan.predicate,
      from: candidates.register
        .filter((r) => r.subject === plan.subject && r.predicate === plan.predicate)
        .map((r) => r.value),
      to: plan.value,
      newPredicate: plan.newPredicate,
    };
  }

  const titles = titlesIn(candidates);

  if (plan.kind === 'amend-note') {
    return {
      kind: 'amend',
      target: ref(plan.amends, titles),
      title: plan.title,
      body: clip(plan.content),
    };
  }

  if (plan.kind === 'new-note') {
    return {
      kind: 'new-note',
      title: plan.title,
      body: clip(plan.content),
      folder: plan.folder,
      layer: plan.layer,
      tags: plan.tags,
    };
  }

  return { kind: 'rule', rule: ref(plan.noteId, titles), decision: plan.decision };
};

export const receiptOf = (wrote: Wrote): Receipt => {
  if (wrote.kind === 'register') {
    return {
      kind: 'register',
      subject: wrote.subject,
      predicate: wrote.predicate,
      previous: wrote.previous,
      value: wrote.value,
      newPredicate: wrote.newPredicate,
      similar: wrote.similar,
    };
  }

  if (wrote.kind === 'rule') {
    return {
      kind: 'rule',
      id: wrote.note.id,
      title: wrote.note.title,
      decision: wrote.decision,
    };
  }

  return {
    kind: 'note',
    id: wrote.note.id,
    title: wrote.note.title,
    corrected: wrote.amended ? { id: wrote.amended.id, title: wrote.amended.title } : null,
    unlinked: wrote.amendsMissing,
  };
};
