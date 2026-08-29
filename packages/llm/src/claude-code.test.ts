import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClaudeCode } from './claude-code.ts';
import type { LlmFailure, LlmRequest } from './types.ts';

let dir: string;

const ASK: LlmRequest = { prompt: 'say something', model: 'sonnet' };

const fakeBinary = (script: string) => {
  const path = join(dir, 'fake-claude');
  writeFileSync(path, `#!/bin/sh\n${script}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
};

const failure = (result: unknown) => result as LlmFailure;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-llm-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the Claude Code provider', () => {
  it('returns what the model said, and how long the reader waited', async () => {
    const ask = createClaudeCode(fakeBinary(`printf '%s' '{"result":"hello","duration_ms":1234}'`));

    expect(await ask(ASK)).toEqual({ text: 'hello', durationMs: 1234 });
  });

  it('strips the vault tools, so a proposal cannot write itself in', async () => {
    const argv = join(dir, 'argv.txt');
    const ask = createClaudeCode(
      fakeBinary(`printf '%s\\n' "$@" > "${argv}"; printf '%s' '{"result":"ok"}'`),
    );

    await ask(ASK);
    const passed = readFileSync(argv, 'utf8').split('\n');

    expect(passed).toContain('--strict-mcp-config');
    expect(passed).toContain('{"mcpServers":{}}');
    expect(passed).toContain('say something');
    expect(passed).toContain('sonnet');
    expect(passed).toContain('json');
  });

  it('does not leave the model waiting on input that is never coming', async () => {
    const ask = createClaudeCode(
      fakeBinary(`stdin=$(cat); printf '{"result":"read [%s]"}' "$stdin"`),
    );

    expect(await ask(ASK)).toEqual({ text: 'read []', durationMs: 0 });
  });

  it('reads the envelope even when the process exits non-zero', async () => {
    const ask = createClaudeCode(
      fakeBinary(`printf '%s' '{"is_error":true,"result":"rate limited"}'; exit 1`),
    );

    expect(await ask(ASK)).toEqual({ error: 'rate limited' });
  });

  it('reports a refusal that carries no result at all', async () => {
    const ask = createClaudeCode(fakeBinary(`printf '%s' '{"is_error":true}'`));

    expect(failure(await ask(ASK)).error).toBe('Claude reported an error');
  });

  it('falls back to stderr when the process failed without an envelope', async () => {
    const ask = createClaudeCode(fakeBinary(`echo "not logged in" >&2; exit 2`));

    expect(failure(await ask(ASK)).error).toContain('not logged in');
  });

  it('says the provider is missing rather than echoing a shell error', async () => {
    const ask = createClaudeCode(join(dir, 'nothing-here'));

    expect(failure(await ask(ASK)).code).toBe('not-installed');
  });

  it('clips a failure that echoes the prompt back, so the note is not the error', async () => {
    const ask = createClaudeCode(fakeBinary(`printf 'x%.0s' $(seq 1 900) >&2; exit 1`));

    const { error } = failure(await ask(ASK));
    expect(error.length).toBeLessThanOrEqual(301);
    expect(error.endsWith('…')).toBe(true);
  });
});
