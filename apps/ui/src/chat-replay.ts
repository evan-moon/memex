import type { ChatReply } from './api.ts';

const KINDS = ['answer', 'done', 'confirm', 'unmapped', 'failed'];

// The row is the app's own writing, but it is still text read back out of a
// column: a shape nobody recognises is nothing to draw, and the screen has a
// fallback for exactly that.
export const parseReply = (raw: string | null): ChatReply | null => {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const kind = (parsed as { kind?: unknown }).kind;
    return typeof kind === 'string' && KINDS.includes(kind) ? (parsed as ChatReply) : null;
  } catch {
    return null;
  }
};

// Turns recorded before the reply was kept hold only the line written for the
// next prompt. It is the wrong voice and the wrong reader, but it is the only
// record of what came back — shown without the prefix that was never for them.
const PROMPT_VOICE = /^they were told:\s*/;

export const asShown = (outcome: string): string => outcome.replace(PROMPT_VOICE, '');
