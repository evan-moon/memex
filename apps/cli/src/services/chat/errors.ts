import type { LlmFailure, LlmFailureCode } from '@memex/llm';

// Everything a turn can fail at, at the granularity a reader would act on
// differently. The provider tells these apart from the CLI's own envelope —
// `unreadable-plan` is the one this layer decides, when the answer arrived and
// was not a plan.
export type ChatFailure = LlmFailureCode | 'unreadable-plan';

// And everything the press can fail at. Kept apart from ChatFailure because
// they answer a different question: not "why did it not understand" but "why
// did the write not go through".
export type ApplyFailure = 'register-rejected' | 'save-rejected' | 'target-missing';

// Where to send them, not what to say to them: the sentences belong with the
// rest of the copy, in both languages, and a service that answers in one
// language decides for the reader which one they read.
export type Remedy = 'install' | 'sign-in' | 'billing' | 'retry' | 'rephrase' | 'none';

const REMEDIES: Record<ChatFailure | ApplyFailure, Remedy> = {
  'not-installed': 'install',
  'logged-out': 'sign-in',
  // A plan refused for spend or rate is the account's answer, not memex's, and
  // retrying is not what changes it.
  quota: 'billing',
  'model-refused': 'retry',
  refused: 'retry',
  timeout: 'retry',
  // They stopped it. Nothing to fix and nothing to offer.
  cancelled: 'none',
  'unreadable-plan': 'rephrase',
  'register-rejected': 'rephrase',
  'save-rejected': 'none',
  'target-missing': 'rephrase',
};

export const remedyFor = (failure: ChatFailure | ApplyFailure): Remedy => REMEDIES[failure];

// Every failure named here leaves the vault untouched. Planning writes nothing
// by construction, and applying checks its target before saving — so a screen
// showing any of these can say nothing was written and be right. In a
// correction tool, not knowing whether it landed is worse than knowing it
// did not.
export const failureOf = (llm: LlmFailure): ChatFailure => llm.code ?? 'refused';
