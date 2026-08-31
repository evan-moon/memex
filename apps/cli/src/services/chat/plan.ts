import type { RegisterScope } from '@memex/db';
import { tagKey } from '@memex/utils';

export type Carried =
  | { kind: 'register'; subject: string }
  | { kind: 'topic'; tag: string }
  | { kind: 'note'; id: number };

// What the model is allowed to come back with. Deleting is not here: a
// correction tool that can be talked into removing the thing it was asked to
// fix has no undo worth the name. Nor is writing a rule — the person asked for
// rules to be approved, and guidance drafted by the model from a sentence that
// was about something else is the one write that steers every later answer.
export type PlanDraft =
  | { action: 'set-register'; subject: string; predicate: string; value: string }
  | { action: 'amend-note'; amends: number; title: string; content: string }
  | {
      action: 'new-note';
      title: string;
      content: string;
      folder: string | null;
      layer: 'past' | 'state';
      tags: string[];
    }
  | { action: 'rule-decision'; noteId: number; decision: 'approve' | 'decline' }
  | { action: 'answer'; text: string; cites: number[] }
  | { action: 'search'; query: string; limit: number | null }
  | { action: 'read'; ids: number[] }
  | { action: 'use-skill'; id: number }
  | { action: 'none' };

// `search` and `read` are not here either, for a plainer reason: they are not
// what the turn decided, they are what it needed on the way. The loop runs them
// and asks again, so nothing downstream ever sees one.

// `answer` is not here on purpose. A plan is a write, and everything downstream
// of one — preview, ticket, confirm, receipt — exists to put a person between
// the sentence and the change. An answer changes nothing, so routing it through
// that machinery would only teach the machinery to carry things it must not.

// The executable form. `scope` and `newPredicate` are not in the draft because
// the model does not decide them: the app reads them off the candidate it
// showed, so a scope nobody is looking at cannot be written by a sentence that
// never mentioned one.
export type Plan =
  | {
      kind: 'set-register';
      subject: string;
      predicate: string;
      scope: RegisterScope;
      value: string;
      newPredicate: boolean;
    }
  | { kind: 'amend-note'; amends: number; title: string; content: string }
  | {
      kind: 'new-note';
      title: string;
      content: string;
      folder: string | null;
      layer: 'past' | 'state';
      tags: string[];
    }
  | { kind: 'rule-decision'; noteId: number; decision: 'approve' | 'decline' };

export type Confirmation = 'immediate' | 'confirm';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const id = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => text(item) !== null) : [];

const draftFrom = (parsed: Record<string, unknown>): PlanDraft | null => {
  if (parsed.action === 'none') return { action: 'none' };

  if (parsed.action === 'set-register') {
    const subject = text(parsed.subject);
    const predicate = text(parsed.predicate);
    const value = text(parsed.value);
    return subject && predicate && value
      ? { action: 'set-register', subject, predicate, value }
      : null;
  }

  if (parsed.action === 'amend-note') {
    const amends = id(parsed.amends);
    const title = text(parsed.title);
    const content = text(parsed.content);
    return amends && title && content ? { action: 'amend-note', amends, title, content } : null;
  }

  if (parsed.action === 'new-note') {
    const title = text(parsed.title);
    const content = text(parsed.content);
    const layer = parsed.layer === 'state' ? 'state' : parsed.layer === 'past' ? 'past' : null;
    return title && content && layer
      ? {
          action: 'new-note',
          title,
          content,
          folder: text(parsed.folder),
          layer,
          tags: stringList(parsed.tags),
        }
      : null;
  }

  if (parsed.action === 'answer') {
    const answer = text(parsed.text);
    return answer
      ? {
          action: 'answer',
          text: answer,
          cites: Array.isArray(parsed.cites)
            ? parsed.cites.filter((cite): cite is number => id(cite) !== null)
            : [],
        }
      : null;
  }

  if (parsed.action === 'search') {
    const query = text(parsed.query);
    return query ? { action: 'search', query, limit: id(parsed.limit) } : null;
  }

  if (parsed.action === 'read') {
    const ids = Array.isArray(parsed.ids)
      ? parsed.ids.filter((one): one is number => id(one) !== null)
      : [];
    return ids.length > 0 ? { action: 'read', ids } : null;
  }

  if (parsed.action === 'use-skill') {
    const skill = id(parsed.id);
    return skill === null ? null : { action: 'use-skill', id: skill };
  }

  if (parsed.action === 'rule-decision') {
    const noteId = id(parsed.noteId);
    const decision =
      parsed.decision === 'approve' ? 'approve' : parsed.decision === 'decline' ? 'decline' : null;
    return noteId && decision ? { action: 'rule-decision', noteId, decision } : null;
  }

  return null;
};

// A shape this does not recognise becomes null rather than a half-filled plan.
// The turn then reports that it understood nothing, which is recoverable; a
// plan missing the field nobody checked is a write nobody asked for.
export const parsePlanDraft = (raw: string): PlanDraft | null => {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    return isRecord(parsed) ? draftFrom(parsed) : null;
  } catch {
    return null;
  }
};

// One case writes without asking: a value already on screen, under a key that
// already exists, on the subject the conversation was opened on. Everything
// else is shown first.
//
// A new predicate is confirmed even then, because the register does not merge
// keys that only look alike — `trial.duration` and `trial_length` each get
// their own provisional id. Telling someone afterwards is telling them after
// the fork exists.
export const confirmationFor = (plan: Plan, carried: Carried | null): Confirmation => {
  if (plan.kind !== 'set-register' || plan.newPredicate) return 'confirm';
  if (carried?.kind !== 'register') return 'confirm';
  return tagKey(carried.subject) === tagKey(plan.subject) ? 'immediate' : 'confirm';
};
