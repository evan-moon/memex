import { randomUUID } from 'node:crypto';
import type { ApplyFailure, ChatFailure, Remedy } from '../chat/errors.ts';
import { remedyFor } from '../chat/errors.ts';
import type { Carried, Plan } from '../chat/plan.ts';
import type { Preview, Receipt } from '../chat/render.ts';
import { previewOf, receiptOf } from '../chat/render.ts';
import type { ChatDeps } from '../chat/turn.ts';
import { applyPlan, planTurn } from '../chat/turn.ts';

export type ChatReply =
  | { kind: 'done'; receipt: Receipt }
  | { kind: 'confirm'; ticket: string; preview: Preview }
  | { kind: 'unmapped'; reason: 'none' | 'unknown-target'; searchable: boolean }
  | { kind: 'failed'; failure: ChatFailure | ApplyFailure; remedy: Remedy; detail: string };

// A plan is applied by the ticket the server handed out, never by a plan the
// page sends back. What lands is then exactly what was previewed, and the
// window between reading and pressing cannot be used to change it.
const PENDING_LIMIT = 20;

export type Pending = Map<string, Plan>;

const remember = (pending: Pending, plan: Plan) => {
  const ticket = randomUUID();
  pending.set(ticket, plan);
  for (const stale of [...pending.keys()].slice(0, -PENDING_LIMIT)) pending.delete(stale);
  return ticket;
};

const failed = (failure: ChatFailure | ApplyFailure, detail = ''): ChatReply => ({
  kind: 'failed',
  failure,
  remedy: remedyFor(failure),
  detail,
});

export const startChat = async (
  deps: ChatDeps,
  pending: Pending,
  message: string,
  carried: Carried | null,
  signal?: AbortSignal,
): Promise<ChatReply> => {
  const turn = await planTurn(deps, message, carried, signal);

  if (turn.kind === 'failed') return failed(turn.failure, turn.detail);
  if (turn.kind === 'unmapped') {
    return { kind: 'unmapped', reason: turn.reason, searchable: turn.candidates.searchable };
  }

  const preview = previewOf(turn.plan, turn.candidates);
  if (turn.confirmation === 'confirm') {
    return { kind: 'confirm', ticket: remember(pending, turn.plan), preview };
  }

  const applied = await applyPlan(deps, turn.plan);
  return applied.ok ? { kind: 'done', receipt: receiptOf(applied.wrote) } : failed(applied.reason);
};

export const applyTicket = async (
  deps: ChatDeps,
  pending: Pending,
  ticket: string,
): Promise<ChatReply | null> => {
  const plan = pending.get(ticket);
  if (plan === undefined) return null;
  pending.delete(ticket);

  const applied = await applyPlan(deps, plan);
  return applied.ok ? { kind: 'done', receipt: receiptOf(applied.wrote) } : failed(applied.reason);
};

export const carriedFrom = (params: URLSearchParams): Carried | null => {
  const subject = params.get('subject');
  if (subject !== null && subject.trim().length > 0) return { kind: 'register', subject };
  const note = Number(params.get('note'));
  return Number.isInteger(note) && note > 0 ? { kind: 'note', id: note } : null;
};
