export type AssistantId = 'claude-code' | 'codex';

export type AssistantState =
  | { kind: 'missing' }
  | { kind: 'unreadable'; binary: string; reason: string }
  | { kind: 'logged-out'; binary: string }
  | { kind: 'ready'; binary: string; method: string | null; plan: string | null };

// What the reader is signing in as, rather than which flag the CLI wants. A
// subscription is the path nearly everyone takes; metered is the one for an
// account billed per token. Not every CLI offers both.
export type LoginMethod = 'subscription' | 'metered';
