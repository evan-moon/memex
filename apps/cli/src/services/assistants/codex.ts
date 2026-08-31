import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { AssistantState } from './types.ts';

const STATUS_TIMEOUT_MS = 15_000;

// Where the standalone installer puts it, then the two package managers, then
// whatever PATH the app was handed. Same reason as Claude Code's: an app opened
// from Finder inherits none of the login shell's PATH.
const HOME_CANDIDATES = ['.local/bin/codex'];

const ABSOLUTE_CANDIDATES = ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'];

const fromPath = (pathEnv: string) =>
  pathEnv
    .split(delimiter)
    .filter((dir) => dir !== '')
    .map((dir) => join(dir, 'codex'));

export const findCodexBinary = (home: string, pathEnv = ''): string | null =>
  [
    ...HOME_CANDIDATES.map((relative) => join(home, relative)),
    ...ABSOLUTE_CANDIDATES,
    ...fromPath(pathEnv),
  ].find(existsSync) ?? null;

const run = (binary: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
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
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr });
    });
  });

// `codex login status` exits 0 whether or not anyone is signed in, so the text
// is the whole answer. It reads "Logged in using ChatGPT" or "Not logged in";
// anything else is a version that says it differently, and calling that signed
// out would send someone to fix what is not broken.
export const readCodexStatus = (output: string): AssistantState['kind'] | null => {
  if (/^\s*not logged in/im.test(output)) return 'logged-out';
  if (/logged in/i.test(output)) return 'ready';
  return null;
};

// What it is signed in with, taken from the same line: "Logged in using ChatGPT"
// or an API key. Left null when the line does not say.
export const readCodexMethod = (output: string): string | null =>
  /logged in using (.+?)\s*$/im.exec(output)?.[1]?.trim() ?? null;

export const readCodex = async (home: string, pathEnv = ''): Promise<AssistantState> => {
  const binary = findCodexBinary(home, pathEnv);
  if (binary === null) return { kind: 'missing' };

  const outcome = await run(binary, ['login', 'status']).catch((error: unknown) => ({
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
  }));
  const output = `${outcome.stdout}\n${outcome.stderr}`;
  const kind = readCodexStatus(output);

  if (kind === null) {
    return { kind: 'unreadable', binary, reason: output.trim().slice(0, 300) || 'no output' };
  }
  // The plan lives on the ChatGPT account rather than in anything the CLI
  // reports, so there is nothing honest to put here.
  return kind === 'ready'
    ? { kind: 'ready', binary, method: readCodexMethod(output), plan: null }
    : { kind: 'logged-out', binary };
};
