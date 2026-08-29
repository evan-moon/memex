import type { ChatReply } from './api.ts';

export type Said = { said: string; outcome: string };

// The last few turns, and no more: a correction panel is not a transcript, and
// the point of carrying anything at all is that the next turn knows what the
// last one settled — which the one before that rarely changes.
const KEEP = 6;

// Written for a model rather than for a reader, so it says what happened in
// plain terms and in one language. The screen's own sentences live in i18n.
const outcomeOf = (reply: ChatReply | null, discarded?: boolean): string => {
  if (discarded) return 'they left it alone; nothing was written';
  if (reply === null) return 'still waiting for an answer';
  if (reply.kind === 'failed')
    return `it could not be done (${reply.failure}); nothing was written`;
  if (reply.kind === 'unmapped') return 'it was not understood; nothing was written';
  if (reply.kind === 'confirm') return 'a change was proposed and is waiting to be pressed';

  const { receipt } = reply;
  if (receipt.kind === 'register') {
    return `${receipt.subject} · ${receipt.predicate} is now ${receipt.value}`;
  }
  if (receipt.kind === 'rule') {
    return `the rule “${receipt.title}” was ${receipt.decision}d`;
  }
  return receipt.corrected
    ? `saved “${receipt.title}”, correcting “${receipt.corrected.title}”`
    : `saved “${receipt.title}”`;
};

export const digest = (
  exchanges: { said: string; reply: ChatReply | null; discarded?: boolean }[],
): Said[] =>
  exchanges.slice(-KEEP).map((exchange) => ({
    said: exchange.said,
    outcome: outcomeOf(exchange.reply, exchange.discarded),
  }));
