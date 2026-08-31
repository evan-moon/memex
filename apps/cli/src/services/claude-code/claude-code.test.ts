import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findClaudeBinary } from './binary.ts';
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
