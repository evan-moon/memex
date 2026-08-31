import { spawn } from 'node:child_process';
import type { AssistantState } from '../assistants/types.ts';
import { findClaudeBinary } from './binary.ts';

const STATUS_TIMEOUT_MS = 15_000;

type AuthEnvelope = {
  loggedIn?: boolean;
  authMethod?: string;
  subscriptionType?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' ? value : null);

const run = (binary: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill(), STATUS_TIMEOUT_MS);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });

// `claude auth status --json` is not a published contract, so a shape this does
// not recognise becomes `unreadable` rather than `logged-out`. Telling someone
// they are signed out when they are signed in sends them to fix what is not
// broken; `unreadable` sends them to the manual instructions instead.
export const readClaudeCode = async (home: string, pathEnv = ''): Promise<AssistantState> => {
  const binary = findClaudeBinary(home, pathEnv);
  if (binary === null) return { kind: 'missing' };

  const outcome = await run(binary, ['auth', 'status', '--json']).catch((error: unknown) => ({
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
    code: null,
  }));

  const parsed = ((): AuthEnvelope | null => {
    try {
      const value: unknown = JSON.parse(outcome.stdout);
      return isRecord(value) ? (value as AuthEnvelope) : null;
    } catch {
      return null;
    }
  })();

  if (parsed === null || typeof parsed.loggedIn !== 'boolean') {
    return {
      kind: 'unreadable',
      binary,
      reason: (outcome.stderr || outcome.stdout || 'no output').slice(0, 300),
    };
  }

  return parsed.loggedIn
    ? {
        kind: 'ready',
        binary,
        method: text(parsed.authMethod),
        plan: text(parsed.subscriptionType),
      }
    : { kind: 'logged-out', binary };
};
