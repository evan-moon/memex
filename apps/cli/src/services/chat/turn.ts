import { isSaveRejection, saveNote, semanticSearch } from '@memex/core';
import {
  approveRule,
  declineRule,
  getNote,
  listRules,
  parseTags,
  type MemexClient,
  matchRegisterSubjects,
  type Note,
  type NoteLayer,
  type RegisterScope,
  readRegister,
  setRegister,
} from '@memex/db';
import type { Embedder } from '@memex/embed';
import { isLlmFailure, type LlmChoice, type LlmProvider } from '@memex/llm';
import { tagKey } from '@memex/utils';
import { askWith } from '../llm.ts';
import { bodyOf, plainSnippet } from '../ui/notes.ts';
import { topicNotes } from '../ui/topics.ts';
import { type ApplyFailure, type ChatFailure, failureOf } from './errors.ts';
import {
  type Carried,
  type Confirmation,
  confirmationFor,
  type Plan,
  type PlanDraft,
  parsePlanDraft,
} from './plan.ts';

const NOTE_CANDIDATES = 6;
const RULE_CANDIDATES = 5;
const SNIPPET_CHARS = 200;
const DETAIL_CHARS = 300;

// The model can look past what it was handed, and the loop that lets it has to
// end whether or not the model decides it is finished. Rounds bound the calls,
// reads bound how much vault one turn can pull into a prompt, and the search
// limit stops one query from spending the read budget by itself.
const MAX_LOOKUPS = 6;
// A skill is loaded whole rather than snipped: half a set of instructions is
// worse than none, because the model cannot tell which half it is missing. That
// makes it the largest thing a prompt carries, and it is carried for the rest
// of the turn — which is the cost of the model working the way this person does
// rather than the way it would have guessed.
const SKILL_CHARS = 16000;
const MAX_READS = 40;
const MAX_SEARCH = 20;
const READ_CHARS = 1500;

export type ChatDeps = {
  client: MemexClient;
  embedder: Embedder;
  vaultPath: string;
  ask?: LlmProvider;
};

// What was said and what came of it, one line each. The app holds this, not the
// model: no provider is ever handed a conversation it is expected to remember,
// so switching from one to another mid-conversation is just the next turn.
export type Said = { said: string; outcome: string };

export type NoteCandidate = { id: number; title: string; layer: NoteLayer; snippet: string };

export type RegisterCandidate = {
  subject: string;
  predicate: string;
  scope: RegisterScope;
  value: string;
};

export type RuleCandidate = { id: number; title: string; snippet: string };

// A way of working the person approved and kept. It is a `rule` note, so it
// arrives provisional and cannot run until they say it may — the same gate that
// stops the vault from teaching itself something nobody agreed to.
export type SkillCandidate = { id: number; title: string; snippet: string };

export type Candidates = {
  notes: NoteCandidate[];
  register: RegisterCandidate[];
  rules: RuleCandidate[];
  skills: SkillCandidate[];
  searchable: boolean;
};

export type Cited = { id: number; title: string };

export type Lookup =
  | { kind: 'searched'; query: string; found: NoteCandidate[] }
  | { kind: 'read'; notes: { id: number; title: string; body: string }[] }
  | { kind: 'skill'; title: string; body: string };

export type Turn =
  | { kind: 'plan'; plan: Plan; confirmation: Confirmation; candidates: Candidates }
  | { kind: 'answer'; text: string; cites: Cited[]; candidates: Candidates }
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

const TOPIC_CANDIDATES = 8;

// What the reader is looking at goes in front of what search found. A topic is
// a screenful of notes rather than one, so it seeds the list the same way an
// opened note does — the sentence "these" then means the same thing to the
// model as it does to the person who typed it.
const onScreen = (deps: ChatDeps, carried: Carried | null): Note[] => {
  if (carried?.kind === 'note') {
    const opened = getNote(deps.client, carried.id);
    return opened ? [opened] : [];
  }
  if (carried?.kind !== 'topic') return [];
  return topicNotes(deps.client, carried.tag)
    .slice(0, TOPIC_CANDIDATES)
    .flatMap((row) => {
      const note = getNote(deps.client, row.id);
      return note === undefined ? [] : [note];
    });
};

const noteCandidates = async (deps: ChatDeps, carried: Carried | null, message: string) => {
  const opened = onScreen(deps, carried);

  // Search is the only step that needs the embedding model, and it is the only
  // step a register correction can do without. A vault still downloading the
  // weights answers "what is this value now" and says so about the rest.
  const found = await semanticSearch(deps.client, deps.embedder, message, NOTE_CANDIDATES).catch(
    () => null,
  );

  const notes = [...opened, ...(found ?? [])];

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
    skills: skillCandidates(deps.client),
  };
};

const SKILL_TAG = tagKey('skill');

// Only approved skills are offered. A provisional one is listed for approval
// like any other rule, which is the point: the person sees what it says before
// it can act on their vault.
export const skillCandidates = (client: MemexClient): SkillCandidate[] =>
  listRules(client, 'canonical')
    .filter((rule) => parseTags(rule.tags).some((tag) => tagKey(tag) === SKILL_TAG))
    .map((rule) => ({ id: rule.id, title: rule.title, snippet: snippet(rule, DETAIL_CHARS) }));

const scopeLabel = (scope: RegisterScope) =>
  scope.kind === 'global' ? 'always' : `${scope.start}..${scope.end}`;

const listOr = (lines: string[], empty: string) => (lines.length > 0 ? lines.join('\n') : empty);

const soFar = (history: Said[]) =>
  history.length === 0
    ? ''
    : `\n=== EARLIER IN THIS CONVERSATION ===\n${history
        .map((turn) => `they said: ${turn.said}\n  what happened: ${turn.outcome}`)
        .join('\n')}\n`;

const lookupsBlock = (lookups: Lookup[], left: number) => {
  const done =
    lookups.length === 0
      ? ''
      : `\n=== WHAT YOU HAVE LOOKED UP ===\n${lookups
          .map((lookup) =>
            lookup.kind === 'searched'
              ? `searched "${lookup.query}" →\n${listOr(
                  lookup.found.map((n) => `  #${n.id} [${n.layer}] ${n.title} — ${n.snippet}`),
                  '  (nothing)',
                )}`
              : lookup.kind === 'skill'
                ? `skill "${lookup.title}" →\n${lookup.body}`
                : lookup.notes.map((n) => `read #${n.id} "${n.title}" →\n${n.body}`).join('\n'),
          )
          .join('\n')}\n`;

  return `${done}\n=== LOOKUPS LEFT ===\n${
    left > 0
      ? `${left}. Use them when the answer needs more than what is listed above.`
      : 'None. Answer from what you have, and say what you could not reach.'
  }\n`;
};

export const buildPrompt = (
  message: string,
  candidates: Candidates,
  history: Said[] = [],
  lookups: Lookup[] = [],
  lookupsLeft = MAX_LOOKUPS,
) =>
  `You help a person write and look after their second brain — the notes an AI recorded for them. Below is what they said, and the only things you may act on.

Choose exactly one action and answer with raw JSON, no code fence.

  {"action":"search","query":"...","limit":10}
    Search the whole vault, not just the notes listed below. What you find comes
    back to you and you choose again. A question about the vault as a whole is
    not answerable from the list below — search first.

  {"action":"use-skill","id":<id>}
    A way of working this person has written down and approved. When what they
    asked for is what a listed skill describes, load it before doing anything
    else — its instructions come back and you choose again. Follow it; it says
    how they want this done, which you cannot infer from the request.

  {"action":"read","ids":[<id>,...]}
    Read the full body of notes whose titles you have seen. The text comes back
    and you choose again. Snippets are cut short; read before judging one.

  {"action":"answer","text":"...","cites":[<id>,...]}
    They asked something rather than asked for a change. Answer from the notes
    you have been shown or have looked up, and nothing else, and put the ids you
    used in "cites". Say what you could not reach instead of filling the gap — a
    guess here is indistinguishable from a memory. Prefer this over "none" for
    any question.

  {"action":"set-register","subject":"...","predicate":"...","value":"..."}
    A fact whose current value changed. Reuse a subject and predicate spelled exactly as listed below whenever one fits; invent one only when nothing listed is the same fact.

  {"action":"amend-note","amends":<id>,"title":"...","content":"..."}
    A past note got something wrong. This writes a NEW note that corrects it — the original is never edited. Only an id listed below.

  {"action":"new-note","title":"...","content":"...","folder":"projects/x"|null,"layer":"past"|"state","tags":["..."]}
    Something worth keeping that corrects nothing.

  {"action":"rule-decision","noteId":<id>,"decision":"approve"|"decline"}
    Only for a rule listed under RULES AWAITING APPROVAL, and only when the person clearly says whether to keep it.

  {"action":"none"}
    They asked for a change and you cannot tell which one, or nothing listed
    matches. A question is never this — answer it.

Write titles and content in the language the person used.

${soFar(history)}${lookupsBlock(lookups, lookupsLeft)}
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

=== SKILLS ===
${listOr(
  candidates.skills.map((s) => `#${s.id} ${s.title} — ${s.snippet}`),
  '(none)',
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
  if (draft.action === 'none' || draft.action === 'answer') return null;
  if (draft.action === 'search' || draft.action === 'read') return null;
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

  if (draft.action !== 'rule-decision') return null;

  // Approval is the person's, and it only means something if they read the
  // rule. Anything that is not still waiting — already canonical, or not a rule
  // at all — is not theirs to approve here.
  const rule = getNote(deps.client, draft.noteId);
  return rule?.layer === 'rule' && rule.ruleStatus === 'provisional'
    ? { kind: 'rule-decision', noteId: draft.noteId, decision: draft.decision }
    : null;
};

export type TurnRequest = {
  message: string;
  carried?: Carried | null;
  choice: LlmChoice;
  history?: Said[];
  signal?: AbortSignal;
};

const asCandidate = (note: Note): NoteCandidate => ({
  id: note.id,
  title: note.title,
  layer: note.layer,
  snippet: snippet(note),
});

const runSearch = async (
  deps: ChatDeps,
  draft: Extract<PlanDraft, { action: 'search' }>,
): Promise<Lookup> => {
  const limit = Math.min(draft.limit ?? MAX_SEARCH, MAX_SEARCH);
  const found = await semanticSearch(deps.client, deps.embedder, draft.query, limit).catch(
    () => [] as Note[],
  );
  return { kind: 'searched', query: draft.query, found: found.map(asCandidate) };
};

const runRead = (deps: ChatDeps, ids: number[], budget: number): Lookup => ({
  kind: 'read',
  notes: ids.slice(0, budget).flatMap((id) => {
    const note = getNote(deps.client, id);
    return note === undefined
      ? []
      : [
          {
            id: note.id,
            title: note.title,
            body: bodyOf(note.content, note.title).slice(0, READ_CHARS),
          },
        ];
  }),
});

// Only a skill the prompt offered can be loaded, and only an approved one —
// the list is the whole permission. An id the model reached for otherwise is a
// rule nobody agreed to run.
const runSkill = (deps: ChatDeps, id: number, candidates: Candidates): Lookup | null => {
  const offered = candidates.skills.find((skill) => skill.id === id);
  const note = offered ? getNote(deps.client, id) : undefined;
  return note === undefined
    ? null
    : { kind: 'skill', title: note.title, body: bodyOf(note.content, note.title).slice(0, SKILL_CHARS) };
};

const notesOf = (lookup: Lookup) =>
  lookup.kind === 'searched'
    ? lookup.found
    : lookup.kind === 'skill'
      ? []
      : lookup.notes.map(({ body: _body, ...rest }) => rest);

export const planTurn = async (deps: ChatDeps, request: TurnRequest): Promise<Turn> => {
  const { message, carried = null, choice, history = [], signal } = request;
  const candidates = await gatherCandidates(deps, carried, message);
  const ask = deps.ask ?? askWith(choice);

  // Everything the model has been shown, so a citation can be checked against
  // what it actually saw rather than taken on trust.
  const shown = new Map<number, string>(candidates.notes.map((note) => [note.id, note.title]));
  const lookups: Lookup[] = [];
  let readsLeft = MAX_READS;

  for (let round = 0; ; round += 1) {
    // Spending the read budget ends the looking, not the turn: the next prompt
    // says there is nothing left and asks for the answer, so forty notes read
    // are forty notes answered from rather than thrown away.
    const left = readsLeft > 0 ? MAX_LOOKUPS - round : 0;
    const answer = await ask({
      prompt: buildPrompt(message, candidates, history, lookups, left),
      model: choice.model,
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

    // A lookup the budget cannot pay for is not run, and the next prompt says
    // the budget is gone — so the model answers from what it has rather than
    // being told no and asking again.
    if (draft.action === 'use-skill' && left > 0) {
      const loaded = runSkill(deps, draft.id, candidates);
      if (loaded !== null) {
        lookups.push(loaded);
        continue;
      }
    }

    if ((draft.action === 'search' || draft.action === 'read') && left > 0) {
      const lookup =
        draft.action === 'search'
          ? await runSearch(deps, draft)
          : runRead(deps, draft.ids, readsLeft);
      const seen = notesOf(lookup);
      readsLeft -= seen.length;
      for (const note of seen) shown.set(note.id, note.title);
      lookups.push(lookup);
      continue;
    }

    if (draft.action === 'answer') {
      return {
        kind: 'answer',
        text: draft.text,
        // An id the model reached for that was never on the page is the one
        // shape a reader cannot check, because it looks exactly like one they
        // can.
        cites: draft.cites.flatMap((id) => {
          const title = shown.get(id);
          return title === undefined ? [] : [{ id, title }];
        }),
        candidates,
      };
    }

    const plan = resolve(draft, deps, candidates);
    if (plan !== null) {
      return { kind: 'plan', plan, confirmation: confirmationFor(plan, carried), candidates };
    }

    if (draft.action !== 'search' && draft.action !== 'read' && draft.action !== 'use-skill') {
      return {
        kind: 'unmapped',
        reason: draft.action === 'none' ? 'none' : 'unknown-target',
        candidates,
      };
    }

    // Out of budget and still asking to look. Nothing left to do but say so.
    return { kind: 'unmapped', reason: 'none', candidates };
  }
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
