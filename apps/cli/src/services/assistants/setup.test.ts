import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAttemptFor } from './index.ts';
import { fetchInstaller, runInstaller } from './installer.ts';
import { createLoginRunner } from './login.ts';

let home: string;

const putBinary = (path: string, script: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `#!/bin/sh\n${script}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
};

const attemptFor = (id: 'claude-code' | 'codex', binary: string) => {
  const attempt = loginAttemptFor(id, 'subscription', binary);
  if (attempt === null) throw new Error(`${id} has no subscription sign-in`);
  return attempt;
};

const claudeAttempt = (binary: string) => attemptFor('claude-code', binary);
const codexAttempt = (binary: string) => attemptFor('codex', binary);

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'memex-setup-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
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
    const result = await runInstaller('#!/bin/sh\necho "installing $1"\n', ['stable']);

    expect(result).toEqual({ ok: true, output: 'installing stable\n' });
  });

  // One installer is bash and uses `[[ ]]`; the other is sh. Running either
  // under a shell this picked would break the other wherever /bin/sh is dash.
  it('runs the script under the interpreter the script itself names', async () => {
    const result = await runInstaller('#!/bin/bash\n[[ 1 == 1 ]] && echo "bash ran it"\n');

    expect(result).toEqual({ ok: true, output: 'bash ran it\n' });
  });

  it('keeps the tail of the output when the script fails', async () => {
    const result = await runInstaller('#!/bin/sh\necho "no space left" >&2\nexit 1\n');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('no space left');
  });

  it('runs the file rather than a command string, so a version cannot become code', async () => {
    const marker = join(home, 'pwned');
    const result = await runInstaller('#!/bin/sh\nprintf "%s" "$1" > /dev/null\n', [
      `stable; touch ${marker}`,
    ]);

    expect(result.ok).toBe(true);
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

    const state = await runner.start(claudeAttempt(binary));

    expect(state).toEqual({
      kind: 'waiting',
      url: 'https://claude.ai/oauth/authorize?code=abc',
    });
    expect(opened).toEqual(['https://claude.ai/oauth/authorize?code=abc']);
    runner.cancel();
  });

  it('opens one URL when the CLI wraps it in a terminal hyperlink', async () => {
    const url = 'https://claude.ai/oauth/authorize?code=abc';
    const binary = putBinary(
      join(home, '.local/bin/claude'),
      `printf 'visit: \\033]8;;%s\\a%s\\033]8;;\\a\\n' '${url}' '${url}'; sleep 0.2`,
    );
    const opened: string[] = [];
    const runner = createLoginRunner((seen) => opened.push(seen));

    const state = await runner.start(claudeAttempt(binary));

    expect(state).toEqual({ kind: 'waiting', url });
    expect(opened).toEqual([url]);
    runner.cancel();
  });

  it('waits for the end of a URL that arrives in two pieces', async () => {
    const binary = putBinary(
      join(home, '.local/bin/claude'),
      `printf 'visit: https://claude.ai/oauth/auth'; sleep 0.3; printf 'orize?code=abc\\n'; sleep 0.2`,
    );
    const opened: string[] = [];
    const runner = createLoginRunner((seen) => opened.push(seen));

    const state = await runner.start(claudeAttempt(binary));

    expect(state).toEqual({
      kind: 'waiting',
      url: 'https://claude.ai/oauth/authorize?code=abc',
    });
    expect(opened).toEqual(['https://claude.ai/oauth/authorize?code=abc']);
    runner.cancel();
  });

  // What Codex really prints: the loopback callback it just opened, announced
  // with a full stop, and only then the page a person actually signs in on.
  // Taking the first URL — or keeping the punctuation — sent the browser to a
  // port called `1455.`
  it('passes over the loopback server Codex announces before the real page', async () => {
    const authUrl =
      'https://auth.openai.com/oauth/authorize?client_id=app_EMoam&state=rS0aDXiCOWOhRNPx';
    const binary = putBinary(
      join(home, '.local/bin/codex'),
      [
        `echo "Starting local login server on http://localhost:1455."`,
        `echo "If your browser did not open, navigate to this URL to authenticate:"`,
        `echo ""`,
        `echo "${authUrl}"`,
        `sleep 0.2`,
      ].join('\n'),
    );
    const opened: string[] = [];
    const runner = createLoginRunner((url) => opened.push(url));

    const state = await runner.start(codexAttempt(binary));
    runner.cancel();

    expect(state).toEqual({ kind: 'waiting', url: authUrl });
    expect(opened).toEqual([authUrl]);
  });

  it('drops the full stop a sentence leaves on the end of a URL', async () => {
    const binary = putBinary(
      join(home, '.local/bin/claude'),
      `echo "Open https://claude.com/cai/oauth/authorize?code=abc."; sleep 0.2`,
    );
    const runner = createLoginRunner();

    const state = await runner.start(claudeAttempt(binary));
    runner.cancel();

    expect(state).toEqual({
      kind: 'waiting',
      url: 'https://claude.com/cai/oauth/authorize?code=abc',
    });
  });

  it('reports a binary that will not start instead of waiting on it', async () => {
    const runner = createLoginRunner();

    const state = await runner.start(claudeAttempt(join(home, 'nothing-here')));

    expect(state.kind).toBe('failed');
  });
});
