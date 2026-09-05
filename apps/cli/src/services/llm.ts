import { homedir } from 'node:os';
import {
  createClaudeCode,
  createCodex,
  type LlmChoice,
  type LlmProvider,
  type LlmProviderId,
} from '@memex/llm';
import type { ModelChoice } from '@memex/utils';
import { findClaudeBinary } from './claude-code/index.ts';

export const DEFAULT_CHOICE: LlmChoice = { provider: 'claude-code', model: 'sonnet' };

export const isProviderId = (value: unknown): value is LlmProviderId =>
  value === 'claude-code' || value === 'codex';

// Resolved on every call rather than once. A GUI app inherits none of the login
// shell's PATH, so asking for `claude` by name is how every call reports "not
// installed" on a machine that has it — the trap onboarding already had to climb
// out of. And someone who just installed it from the setup screen would other-
// wise keep getting the answer from before they did.
const providerFor = (id: LlmProviderId): LlmProvider =>
  id === 'codex'
    ? createCodex()
    : createClaudeCode(findClaudeBinary(homedir(), process.env.PATH ?? '') ?? 'claude');

// The config file is text a person can edit, so the provider a job names may
// not be one that exists. An unreadable job falls back to what this service has
// always used rather than failing the call it was asked for.
export const asChoice = (stored: ModelChoice): LlmChoice =>
  isProviderId(stored.provider) && stored.model !== ''
    ? { provider: stored.provider, model: stored.model }
    : DEFAULT_CHOICE;

export const askWith = (choice: LlmChoice): LlmProvider => {
  const provider = providerFor(choice.provider);
  return (request) => provider({ ...request, model: choice.model });
};

export const askClaude: LlmProvider = (request) => providerFor('claude-code')(request);
