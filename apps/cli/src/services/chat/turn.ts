import { isSaveRejection, saveNote, semanticSearch } from '@memex/core';
import {
  approveRule,
  declineRule,
  getNote,
  listRules,
  type MemexClient,
  matchRegisterSubjects,
  type Note,
  type NoteLayer,
  type RegisterScope,
  readRegister,
  setRegister,
} from '@memex/db';
import type { Embedder } from '@memex/embed';
import { claudeCode, isLlmFailure, type LlmModel, type LlmProvider } from '@memex/llm';
import { tagKey } from '@memex/utils';
import { bodyOf, plainSnippet } from '../ui/notes.ts';
import { type ApplyFailure, type ChatFailure, failureOf } from './errors.ts';
import {
  type Carried,
  type Confirmation,
  confirmationFor,
  type Plan,
  type PlanDraft,
  parsePlanDraft,
} from './plan.ts';

export const CHAT_MODEL: LlmModel = 'sonnet';

const NOTE_CANDIDATES = 6;
const RULE_CANDIDATES = 5;
const SNIPPET_CHARS = 200;
const DETAIL_CHARS = 300;

export type ChatDeps = {
  client: MemexClient;
  embedder: Embedder;
  vaultPath: string;
  ask?: LlmProvider;
};

export type NoteCandidate = { id: number; title: string; layer: NoteLayer; snippet: string };

export type RegisterCandidate = {
  subject: string;
  predicate: string;
  scope: RegisterScope;
  value: string;
};

export type RuleCandidate = { id: number; title: string; snippet: string };

export type Candidates = {
  notes: NoteCandidate[];
  register: RegisterCandidate[];
  rules: RuleCandidate[];
  searchable: boolean;
};

export type Turn =
  | { kind: 'plan'; plan: Plan; confirmation: Confirmation; candidates: Candidates }
  | { kind: 'unmapped'; reason: 'none' | 'unknown-target'; candidates: Candidates }
  | { kind: 'failed'; failure: ChatFailure; detail: string };

const snippet = (note: Note, chars = SNIPPET_CHARS) =>
  plainSnippet(bodyOf(note.content, note.title)).slice(0, chars);

const registerCandidates = (
  client: MemexClient,
  carried: Carried | null,
  message: string,
): RegisterCandidate[] => {
  // A conversation opened on a subject is asking about that subject. An empty
  // one only offers subjects whose own name is in the sentence, so the set the
  // model chooses from is one the reader could have named themselves.
  const subjects =
    carried?.kind === 'register' ? [carried.subject] : matchRegisterSubjects(client, [message]);

  return subjects.flatMap((subject) =>
    readRegister(client, subject).flatMap((tip) =>
      tip.heads.map((head) => ({
        subject,
        predicate: tip.predicate,
        scope: tip.scope,
        value: head.value,
      })),
    ),
  );
};

const noteCandidates = async (deps: ChatDeps, carried: Carried | null, message: string) => {
  const opened = carried?.kind === 'note' ? getNote(deps.client, carried.id) : undefined;

  // Search is the only step that needs the embedding model, and it is the only
  // step a register correction can do without. A vault still downloading the
  // weights answers "what is this value now" and says so about the rest.
  const found = await semanticSearch(deps.client, deps.embedder, message, NOTE_CANDIDATES).catch(
    () => null,
  );

  const notes = [...(opened ? [opened] : []), ...(found ?? [])];

  return {
    searchable: found !== null,
    notes: notes
      .filter((note, at) => notes.findIndex((other) => other.id === note.id) === at)
      .map((note) => ({
        id: note.id,
        title: note.title,
        layer: note.layer,
        snippet: snippet(note),
      })),
  };
};

export const gatherCandidates = async (
  deps: ChatDeps,
  carried: Carried | null,
  message: string,
): Promise<Candidates> => {
  const { notes, searchable } = await noteCandidates(deps, carried, message);

  return {
    notes,
    searchable,
    register: registerCandidates(deps.client, carried, message),
    rules: listRules(deps.client, 'provisional')
      .slice(0, RULE_CANDIDATES)
      .map((rule) => ({ id: rule.id, title: rule.title, snippet: snippet(rule, DETAIL_CHARS) })),
  };
};

const scopeLabel = (scope: RegisterScope) =>
  scope.kind === 'global' ? 'always' : `${scope.start}..${scope.end}`;

const listOr = (lines: string[], empty: string) => (lines.length > 0 ? lines.join('\n') : empty);

export const buildPrompt = (message: string, candidates: Candidates) =>
  `A person is correcting what an AI recorded about them in their second brain. Below is what they said, and the only things you may act on.

Choose exactly one action and answer with raw JSON, no code fence.

  {"action":"set-register","subject":"...","predicate":"...","value":"..."}
    A fact whose current value changed. Reuse a subject and predicate spelled exactly as listed below whenever one fits; invent one only when nothing listed is the same fact.

  {"action":"amend-note","amends":<id>,"title":"...","content":"..."}
    A past note got something wrong. This writes a NEW note that corrects it — the original is never edited. Only an id listed below.

  {"action":"new-note","title":"...","content":"...","folder":"projects/x"|null,"layer":"past"|"state","tags":["..."]}
    Something worth keeping that corrects nothing.

  {"action":"rule-decision","noteId":<id>,"decision":"approve"|"decline"}
    Only for a rule listed under RULES AWAITING APPROVAL, and only when the person clearly says whether to keep it.

  {"action":"none"}
    You cannot tell which of the above they mean, or nothing listed matches. Prefer this over guessing.

Write titles and content in the language the person used.

=== WHAT THEY SAID ===
${message}

=== VALUES ON RECORD ===
${listOr(
  candidates.register.map(
    (r) => `${r.subject} · ${r.predicate} (${scopeLabel(r.scope)}) = ${r.value}`,
  ),
  '(none)',
)}

=== NOTES ===
${listOr(
  candidates.notes.map((n) => `#${n.id} [${n.layer}] ${n.title} — ${n.snippet}`),
  candidates.searchable ? '(none)' : '(search is unavailable; do not refer to notes by id)',
)}

=== RULES AWAITING APPROVAL ===
${listOr(
  candidates.rules.map((r) => `#${r.id} ${r.title} — ${r.snippet}`),
  '(none)',
)}`;

const sameKey = (a: string, b: string) => tagKey(a) === tagKey(b);

// The model names a subject and a key; the app decides which record that is.
// Scope comes off the matching candidate rather than the sentence, so a period
// nobody was looking at cannot be overwritten by a sentence about today.
const resolveRegister = (
  draft: Extract<PlanDraft, { action: 'set-register' }>,
  candidates: Candidates,
): Plan => {
  const match = candidates.register.find(
    (r) => sameKey(r.subject, draft.subject) && sameKey(r.predicate, draft.predicate),
  );

  return {
    kind: 'set-register',
    subject: match?.subject ?? draft.subject,
    predicate: match?.predicate ?? draft.predicate,
    scope: match?.scope ?? { kind: 'global' },
    value: draft.value,
    newPredicate: match === undefined,
  };
};

const resolve = (draft: PlanDraft, deps: ChatDeps, candidates: Candidates): Plan | null => {
  if (draft.action === 'none') return null;
  if (draft.action === 'set-register') return resolveRegister(draft, candidates);
  if (draft.action === 'new-note') {
    const { action: _action, ...rest } = draft;
    return { kind: 'new-note', ...rest };
  }

  if (draft.action === 'amend-note') {
    const target = getNote(deps.client, draft.amends);
    return target
      ? { kind: 'amend-note', amends: draft.amends, title: draft.title, content: draft.content }
      : null;
  }

  // Approval is the person's, and it only means something if they read the
  // rule. Anything that is not still waiting — already canonical, or not a rule
  // at all — is not theirs to approve here.
  const rule = getNote(deps.client, draft.noteId);
  return rule?.layer === 'rule' && rule.ruleStatus === 'provisional'
    ? { kind: 'rule-decision', noteId: draft.noteId, decision: draft.decision }
    : null;
};

export const planTurn = async (
  deps: ChatDeps,
  message: string,
  carried: Carried | null = null,
  signal?: AbortSignal,
): Promise<Turn> => {
  const candidates = await gatherCandidates(deps, carried, message);
  const answer = await (deps.ask ?? claudeCode)({
    prompt: buildPrompt(message, candidates),
    model: CHAT_MODEL,
    signal,
  });

  if (isLlmFailure(answer)) {
    return { kind: 'failed', failure: failureOf(answer), detail: answer.error };
  }

  const draft = parsePlanDraft(answer.text);
  if (draft === null) {
    return {
      kind: 'failed',
      failure: 'unreadable-plan',
      detail: answer.text.slice(0, DETAIL_CHARS),
    };
  }

  const plan = resolve(draft, deps, candidates);
  if (plan === null) {
    return {
      kind: 'unmapped',
      reason: draft.action === 'none' ? 'none' : 'unknown-target',
      candidates,
    };
  }

  return { kind: 'plan', plan, confirmation: confirmationFor(plan, carried), candidates };
};

export type Wrote =
  | {
      kind: 'register';
      subject: string;
      predicate: string;
      value: string;
      // What the key said before. An append-only log cannot take an event back,
      // so undoing this is writing the old value again — which the screen has
      // to say, rather than calling it a revert.
      previous: string[];
      newPredicate: boolean;
      similar: string[];
    }
  | {
      kind: 'note';
      note: Note;
      amended: Note | null;
      // Set only when the note was saved and the correction did not attach.
      // saveNote reports a missing amends after writing, so this is the one
      // shape where something landed and something did not.
      amendsMissing: number | null;
    }
  | { kind: 'rule'; note: Note; decision: 'approve' | 'decline' };

export type ApplyResult = { ok: true; wrote: Wrote } | { ok: false; reason: ApplyFailure };

const applyRegister = (
  deps: ChatDeps,
  plan: Extract<Plan, { kind: 'set-register' }>,
): ApplyResult => {
  const previous = readRegister(deps.client, plan.subject)
    .filter((tip) => sameKey(tip.predicate, plan.predicate))
    .flatMap((tip) => tip.heads.map((head) => head.value));

  const written = setRegister(deps.client, {
    subject: plan.subject,
    predicate: plan.predicate,
    scope: plan.scope,
    value: plan.value,
    author: 'person',
  });

  return written.ok
    ? {
        ok: true,
        wrote: {
          kind: 'register',
          subject: plan.subject,
          predicate: written.predicate.label,
          value: plan.value,
          previous,
          newPredicate: written.predicate.created,
          similar: written.predicate.similar,
        },
      }
    : { ok: false, reason: 'register-rejected' };
};

const applyNote = async (
  deps: ChatDeps,
  params: {
    title: string;
    content: string;
    layer: 'past' | 'state';
    folder?: string;
    tags?: string[];
    amends?: number;
  },
): Promise<ApplyResult> => {
  // Checked before saving, not after. saveNote reports an amends id it could
  // not find only once the note is written, and a correction that corrects
  // nothing is the shape this must not leave behind — search would go on
  // returning the claim it was meant to replace.
  if (params.amends !== undefined && getNote(deps.client, params.amends) === undefined) {
    return { ok: false, reason: 'target-missing' };
  }

  const saved = await saveNote(deps.client, deps.embedder, deps.vaultPath, {
    ...params,
    source: 'manual',
    actor: 'user',
  });

  if (isSaveRejection(saved)) return { ok: false, reason: 'save-rejected' };

  return {
    ok: true,
    wrote: {
      kind: 'note',
      note: saved.note,
      amended: saved.amended ?? null,
      // The target can still go away between the check and the save. Then the
      // note exists and the link does not, and the receipt has to say both.
      amendsMissing: saved.amendsMissing ?? null,
    },
  };
};

export const applyPlan = async (deps: ChatDeps, plan: Plan): Promise<ApplyResult> => {
  if (plan.kind === 'set-register') return applyRegister(deps, plan);

  if (plan.kind === 'amend-note') {
    return applyNote(deps, {
      title: plan.title,
      content: plan.content,
      layer: 'past',
      amends: plan.amends,
    });
  }

  if (plan.kind === 'new-note') {
    return applyNote(deps, {
      title: plan.title,
      content: plan.content,
      layer: plan.layer,
      folder: plan.folder ?? undefined,
      tags: plan.tags,
    });
  }

  const decided =
    plan.decision === 'approve'
      ? approveRule(deps.client, plan.noteId)
      : declineRule(deps.client, plan.noteId, 'state');

  return decided
    ? { ok: true, wrote: { kind: 'rule', note: decided, decision: plan.decision } }
    : { ok: false, reason: 'target-missing' };
};
