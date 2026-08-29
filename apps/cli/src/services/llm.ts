import { homedir } from 'node:os';
import { createClaudeCode, type LlmProvider } from '@memex/llm';
import { findClaudeBinary } from './claude-code/index.ts';

// Resolved on every call rather than once. A GUI app inherits none of the login
// shell's PATH, so asking for `claude` by name is how every call reports "not
// installed" on a machine that has it — the trap onboarding already had to climb
// out of. And someone who just installed it from the setup screen would other-
// wise keep getting the answer from before they did.
export const askClaude: LlmProvider = (request) => {
  const binary = findClaudeBinary(homedir(), process.env.PATH ?? '');
  return createClaudeCode(binary ?? 'claude')(request);
};
