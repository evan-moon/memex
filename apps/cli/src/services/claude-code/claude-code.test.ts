import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findClaudeBinary } from './binary.ts';
import { fetchInstaller, runInstaller } from './install.ts';
import { createLoginRunner } from './login.ts';
import { readClaudeCode } from './status.ts';

let home: string;

const putBinary = (path: string, script: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `#!/bin/sh\n${script}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'memex-cc-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('finding the binary', () => {
  it('finds what the installer put under home, with no PATH at all', () => {
    const path = putBinary(join(home, '.local/bin/claude'), 'exit 0');

    expect(findClaudeBinary(home, '')).toBe(path);
  });

  it('still falls back to PATH when it is there', () => {
    const dir = join(home, 'elsewhere');
    const path = putBinary(join(dir, 'claude'), 'exit 0');

    expect(findClaudeBinary(home, `/nowhere:${dir}`)).toBe(path);
  });

  it('reports nothing rather than a name a GUI app cannot resolve', () => {
    expect(findClaudeBinary(home, '/usr/bin:/bin')).toBeNull();
  });
});

describe('reading the state', () => {
  it('says missing when the binary is not there', async () => {
    expect(await readClaudeCode(home, '')).toEqual({ kind: 'missing' });
  });

  it('reads a signed-in session, with the plan it is on', async () => {
    const binary = putBinary(
      join(home, '.local/bin/claude'),
      `printf '%s' '{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max"}'`,
    );

    expect(await readClaudeCode(home, '')).toEqual({
      kind: 'ready',
      binary,
      method: 'claude.ai',
      plan: 'max',
    });
  });

  it('separates signed out from signed in', async () => {
    const binary = putBinary(join(home, '.local/bin/claude'), `printf '%s' '{"loggedIn":false}'`);

    expect(await readClaudeCode(home, '')).toEqual({ kind: 'logged-out', binary });
  });

  it('calls an unrecognised answer unreadable, not signed out', async () => {
    putBinary(join(home, '.local/bin/claude'), `echo "unknown command: auth" >&2; exit 1`);

    const state = await readClaudeCode(home, '');

    expect(state.kind).toBe('unreadable');
    expect(state.kind === 'unreadable' && state.reason).toContain('unknown command');
  });
});

describe('fetching the installer', () => {
  it('refuses anything that is not first-party over TLS', async () => {
    expect(await fetchInstaller('http://claude.ai/install.sh')).toEqual({
      ok: false,
      error: 'Refusing to run a script fetched over http:',
    });
    expect((await fetchInstaller('not a url')).ok).toBe(false);
  });
});

describe('running the installer', () => {
  it('passes the version through and reports what the script printed', async () => {
    const result = await runInstaller('#!/bin/bash\necho "installing $1"\n', 'stable');

    expect(result).toEqual({ ok: true, output: 'installing stable\n' });
  });

  it('keeps the tail of the output when the script fails', async () => {
    const result = await runInstaller('#!/bin/bash\necho "no space left" >&2\nexit 1\n');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('no space left');
  });

  it('runs the file rather than a command string, so a version cannot become code', async () => {
    const marker = join(home, 'pwned');
    const result = await runInstaller(
      '#!/bin/bash\nprintf "%s" "$1" > /dev/null\n',
      `stable; touch ${marker}`,
    );

    expect(result.ok).toBe(true);
    expect(findClaudeBinary(home, '')).toBeNull();
    expect(() => rmSync(marker)).toThrow();
  });
});

describe('the login runner', () => {
  it('opens the page the CLI printed, rather than leaving the reader waiting', async () => {
    const binary = putBinary(
      join(home, '.local/bin/claude'),
      `echo "Open https://claude.ai/oauth/authorize?code=abc to continue"; sleep 0.2`,
    );
    const opened: string[] = [];
    const runner = createLoginRunner((url) => opened.push(url));

    const state = await runner.start(binary, 'claudeai');

    expect(state).toEqual({
      kind: 'waiting',
      url: 'https://claude.ai/oauth/authorize?code=abc',
    });
    expect(opened).toEqual(['https://claude.ai/oauth/authorize?code=abc']);
    runner.cancel();
  });

  it('reports a binary that will not start instead of waiting on it', async () => {
    const runner = createLoginRunner();

    const state = await runner.start(join(home, 'nothing-here'), 'claudeai');

    expect(state.kind).toBe('failed');
  });
});
