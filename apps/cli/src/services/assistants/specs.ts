import { findClaudeBinary } from '../claude-code/binary.ts';
import { readClaudeCode } from '../claude-code/status.ts';
import { findCodexBinary, readCodex } from './codex.ts';
import type { AssistantId, AssistantState, LoginMethod } from './types.ts';

// How memex installs and signs an assistant in. What the app is called, and
// whether it can reach memex, belong to the app registry — one name, one place.
export type AssistantSpec = {
  id: AssistantId;
  installerUrl: string;
  // Claude Code's installer takes the channel as its first argument; Codex's
  // reads one from the environment and ignores what it is passed.
  installerArgs: string[];
  loginArgs: Partial<Record<LoginMethod, string[]>>;
  findBinary: (home: string, pathEnv: string) => string | null;
  read: (home: string, pathEnv: string) => Promise<AssistantState>;
};

export const assistantSpecs: Record<AssistantId, AssistantSpec> = {
  'claude-code': {
    id: 'claude-code',
    installerUrl: 'https://claude.ai/install.sh',
    installerArgs: ['stable'],
    loginArgs: {
      subscription: ['auth', 'login', '--claudeai'],
      metered: ['auth', 'login', '--console'],
    },
    findBinary: findClaudeBinary,
    read: readClaudeCode,
  },
  codex: {
    id: 'codex',
    installerUrl: 'https://chatgpt.com/codex/install.sh',
    installerArgs: [],
    // Signing in with an API key means reading one from stdin, which is a
    // credential memex would have to handle. It is left to the terminal.
    loginArgs: { subscription: ['login'] },
    findBinary: findCodexBinary,
    read: readCodex,
  },
};

export const ASSISTANT_IDS = Object.keys(assistantSpecs) as AssistantId[];

export const isAssistantId = (value: unknown): value is AssistantId =>
  typeof value === 'string' && value in assistantSpecs;

export const isLoginMethod = (value: unknown): value is LoginMethod =>
  value === 'subscription' || value === 'metered';
