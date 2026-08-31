import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findCodexBinary, readCodex, readCodexMethod, readCodexStatus } from './codex.ts';

let home: string;

const putBinary = (path: string, script: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `#!/bin/sh\n${script}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'memex-codex-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('finding the binary', () => {
  it('finds what the installer put under home, with no PATH at all', () => {
    const path = putBinary(join(home, '.local/bin/codex'), 'exit 0');

    expect(findCodexBinary(home, '')).toBe(path);
  });

  it('reports nothing rather than a name a GUI app cannot resolve', () => {
    expect(findCodexBinary(home, '/usr/bin:/bin')).toBeNull();
  });
});

// `codex login status` exits 0 either way, so the exit code says nothing and
// the text is the whole answer.
describe('reading what the status line says', () => {
  it('separates signed out from signed in', () => {
    expect(readCodexStatus('Logged in using ChatGPT')).toBe('ready');
    expect(readCodexStatus('Not logged in')).toBe('logged-out');
  });

  // "Not logged in" contains "logged in", so a looser check would call a
  // signed-out account signed in — the one mistake that matters here.
  it('does not read the negative line as the positive one', () => {
    expect(readCodexStatus('  Not logged in\n')).toBe('logged-out');
  });

  it('refuses to guess at wording it does not know', () => {
    expect(readCodexStatus('error: unknown subcommand `login`')).toBeNull();
    expect(readCodexStatus('')).toBeNull();
  });

  it('takes the account kind off the same line, and nothing when it is absent', () => {
    expect(readCodexMethod('Logged in using ChatGPT')).toBe('ChatGPT');
    expect(readCodexMethod('Logged in using an API key')).toBe('an API key');
    expect(readCodexMethod('Not logged in')).toBeNull();
  });
});

describe('reading the state', () => {
  it('says missing when the binary is not there', async () => {
    expect(await readCodex(home, '')).toEqual({ kind: 'missing' });
  });

  it('reads a signed-in session and what it is signed in with', async () => {
    const binary = putBinary(join(home, '.local/bin/codex'), `echo "Logged in using ChatGPT"`);

    expect(await readCodex(home, '')).toEqual({
      kind: 'ready',
      binary,
      method: 'ChatGPT',
      // Codex never reports which ChatGPT plan the account is on, so claiming
      // one would be inventing it.
      plan: null,
    });
  });

  it('separates signed out from signed in', async () => {
    const binary = putBinary(join(home, '.local/bin/codex'), `echo "Not logged in"`);

    expect(await readCodex(home, '')).toEqual({ kind: 'logged-out', binary });
  });

  it('calls an unrecognised answer unreadable, not signed out', async () => {
    putBinary(join(home, '.local/bin/codex'), `echo "unknown subcommand" >&2; exit 1`);

    const state = await readCodex(home, '');

    expect(state.kind).toBe('unreadable');
    expect(state.kind === 'unreadable' && state.reason).toContain('unknown subcommand');
  });
});

describe('what each assistant is asked to do', () => {
  // Signing in with an API key means reading a credential from stdin, which is
  // left to the terminal — so the screen must not offer it.
  it('offers a metered sign-in only where the CLI has one', async () => {
    const { assistantSpecs } = await import('./specs.ts');

    expect(Object.keys(assistantSpecs['claude-code'].loginArgs)).toEqual([
      'subscription',
      'metered',
    ]);
    expect(Object.keys(assistantSpecs.codex.loginArgs)).toEqual(['subscription']);
  });
});
