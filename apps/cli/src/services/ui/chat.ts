import { randomUUID } from 'node:crypto';
import {
  type ChatTurn,
  recordTurn,
  restateTurn,
  sessionExists,
  sessionTurns,
  startSession,
} from '@memex/db';
import type { LlmChoice } from '@memex/llm';
import type { ApplyFailure, ChatFailure, Remedy } from '../chat/errors.ts';
import { remedyFor } from '../chat/errors.ts';
import type { Carried, Plan } from '../chat/plan.ts';
import type { Preview, Receipt } from '../chat/render.ts';
import { previewOf, receiptOf } from '../chat/render.ts';
import type { ChatDeps, Cited, Said } from '../chat/turn.ts';
import { applyPlan, planTurn } from '../chat/turn.ts';

export type ChatReply =
  | { kind: 'answer'; text: string; cites: Cited[] }
  | { kind: 'done'; receipt: Receipt }
  | { kind: 'confirm'; ticket: string; preview: Preview }
  | { kind: 'unmapped'; reason: 'none' | 'unknown-target'; searchable: boolean }
  | { kind: 'failed'; failure: ChatFailure | ApplyFailure; remedy: Remedy; detail: string };

// Said in plain terms and in one language, because the reader of this is the
// next turn's prompt. The screen's own sentences live with the rest of the copy.
export const outcomeOf = (reply: ChatReply): string => {
  if (reply.kind === 'failed')
    return `it could not be done (${reply.failure}); nothing was written`;
  if (reply.kind === 'unmapped') return 'it was not understood; nothing was written';
  // The answer itself, because the next turn reads this and a question already
  // answered is context the reader expects to be able to build on.
  if (reply.kind === 'answer') return `they were told: ${reply.text}`;
  if (reply.kind === 'confirm') return 'a change was proposed and is waiting to be pressed';

  const { receipt } = reply;
  if (receipt.kind === 'register') {
    return `${receipt.subject} · ${receipt.predicate} is now ${receipt.value}`;
  }
  if (receipt.kind === 'rule') return `the rule “${receipt.title}” was ${receipt.decision}d`;
  return receipt.corrected
    ? `saved “${receipt.title}”, correcting “${receipt.corrected.title}”`
    : `saved “${receipt.title}”`;
};

// A plan is applied by the ticket the server handed out, never by a plan the
// page sends back. What lands is then exactly what was previewed, and the
// window between reading and pressing cannot be used to change it.
const PENDING_LIMIT = 20;

export type Pending = Map<string, { plan: Plan; turnId: number }>;

// A turn owns an AbortController the whole time it runs, keyed by an id the
// page made up. Neither transport carries a cancel of its own — a protocol
// handler is not told the page stopped listening, and an IPC invoke cannot be
// aborted either — so stopping has to be a request like any other.
export type Running = Map<string, AbortController>;

const remember = (pending: Pending, plan: Plan, turnId: number) => {
  const ticket = randomUUID();
  pending.set(ticket, { plan, turnId });
  for (const stale of [...pending.keys()].slice(0, -PENDING_LIMIT)) pending.delete(stale);
  return ticket;
};

// A ticket dies with the process that handed it out, so a proposal read back
// later is a record of what was offered rather than something still pressable.
export const forReplay = (reply: ChatReply): ChatReply =>
  reply.kind === 'confirm' ? { ...reply, ticket: '' } : reply;

const failed = (failure: ChatFailure | ApplyFailure, detail = ''): ChatReply => ({
  kind: 'failed',
  failure,
  remedy: remedyFor(failure),
  detail,
});

export type Asked = {
  message: string;
  carried: Carried | null;
  operationId: string;
  choice: LlmChoice;
  sessionId: number | null;
};

const asSaid = (turns: ChatTurn[]): Said[] =>
  turns.map((turn) => ({ said: turn.said, outcome: turn.outcome }));

export type ChatAnswer = ChatReply & { sessionId: number };

export const startChat = async (
  deps: ChatDeps,
  state: { pending: Pending; running: Running },
  asked: Asked,
): Promise<ChatAnswer> => {
  const { message, carried, operationId, choice } = asked;
  // The transcript is the server's, not the page's: it is what the next prompt
  // is built from, and a history the page could edit is a history the model can
  // be told anything with.
  const session =
    asked.sessionId !== null && sessionExists(deps.client, asked.sessionId)
      ? asked.sessionId
      : startSession(deps.client, message);
  const history = asSaid(sessionTurns(deps.client, session));

  const stopper = new AbortController();
  state.running.set(operationId, stopper);
  const turn = await planTurn(deps, {
    message,
    carried,
    choice,
    history,
    signal: stopper.signal,
  }).finally(() => state.running.delete(operationId));

  const record = (reply: ChatReply) =>
    recordTurn(deps.client, session, {
      said: message,
      outcome: outcomeOf(reply),
      reply: JSON.stringify(forReplay(reply)),
    });

  if (turn.kind === 'failed') {
    const reply = failed(turn.failure, turn.detail);
    record(reply);
    return { ...reply, sessionId: session };
  }

  if (turn.kind === 'answer') {
    const reply: ChatReply = { kind: 'answer', text: turn.text, cites: turn.cites };
    record(reply);
    return { ...reply, sessionId: session };
  }

  if (turn.kind === 'unmapped') {
    const reply: ChatReply = {
      kind: 'unmapped',
      reason: turn.reason,
      searchable: turn.candidates.searchable,
    };
    record(reply);
    return { ...reply, sessionId: session };
  }

  const preview = previewOf(turn.plan, turn.candidates);

  if (turn.confirmation === 'confirm') {
    // Written down as proposed, then restated when it is pressed. The reader
    // made one request; a transcript showing two would be lying about that.
    const turnId = record({ kind: 'confirm', ticket: '', preview });
    return {
      kind: 'confirm',
      ticket: remember(state.pending, turn.plan, turnId),
      preview,
      sessionId: session,
    };
  }

  const applied = await applyPlan(deps, turn.plan);
  const reply: ChatReply = applied.ok
    ? { kind: 'done', receipt: receiptOf(applied.wrote) }
    : failed(applied.reason);
  record(reply);
  return { ...reply, sessionId: session };
};

export const applyTicket = async (
  deps: ChatDeps,
  pending: Pending,
  ticket: string,
): Promise<ChatReply | null> => {
  const held = pending.get(ticket);
  if (held === undefined) return null;
  pending.delete(ticket);

  const applied = await applyPlan(deps, held.plan);
  const reply: ChatReply = applied.ok
    ? { kind: 'done', receipt: receiptOf(applied.wrote) }
    : failed(applied.reason);
  restateTurn(deps.client, held.turnId, outcomeOf(reply), JSON.stringify(forReplay(reply)));
  return reply;
};

// Aborting a turn nobody is running is not an error: the answer arrived first,
// or the page asked twice. Either way there is nothing left to stop.
export const cancelChat = (running: Running, operationId: string) => {
  running.get(operationId)?.abort();
  return running.delete(operationId);
};

export const carriedFrom = (params: URLSearchParams): Carried | null => {
  const subject = params.get('subject');
  if (subject !== null && subject.trim().length > 0) return { kind: 'register', subject };
  const topic = params.get('topic');
  if (topic !== null && topic.trim().length > 0) return { kind: 'topic', tag: topic };
  const note = Number(params.get('note'));
  return Number.isInteger(note) && note > 0 ? { kind: 'note', id: note } : null;
};
