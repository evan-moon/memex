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
    expect(passed).toContain('stream-json');
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

    expect(await ask(ASK)).toEqual({ error: 'rate limited', code: 'refused' });
  });

  // The statuses are what the CLI actually answers with: signing out is decided
  // before a request exists, so it arrives with no status and says so in words,
  // while a model nobody has access to comes back 404.
  it('tells apart the reasons a reader would act on differently', async () => {
    const answering = (body: string) => createClaudeCode(fakeBinary(`printf '%s' '${body}'`))(ASK);

    const cases: [string, string][] = [
      ['{"is_error":true,"result":"Not logged in · Please run /login"}', 'logged-out'],
      ['{"is_error":true,"api_error_status":"401","result":"unauthorized"}', 'logged-out'],
      ['{"is_error":true,"api_error_status":"403","result":"forbidden"}', 'quota'],
      ['{"is_error":true,"api_error_status":"429","result":"slow down"}', 'quota'],
      ['{"is_error":true,"api_error_status":"404","result":"no such model"}', 'model-refused'],
      ['{"is_error":true,"api_error_status":"500","result":"boom"}', 'refused'],
    ];

    for (const [body, code] of cases) {
      expect(failure(await answering(body)).code).toBe(code);
    }
  });

  it('gives up on a provider that has gone quiet, rather than waiting with it', async () => {
    const ask = createClaudeCode(fakeBinary('sleep 30'));

    const result = failure(await ask({ ...ASK, silenceMs: 200 }));

    expect(result.code).toBe('timeout');
  });

  // The seven-minute draft that came back as a timeout. It was never silent —
  // it was writing the whole way — so the run that outlives its window is the
  // one thing this had to stop killing.
  it('lets an answer run long as long as it keeps writing', async () => {
    const line = (text: string) =>
      `{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"${text}"}}}`;
    const ask = createClaudeCode(
      fakeBinary(
        `for i in $(seq 1 14); do echo '${line('.')}'; sleep 0.25; done;` +
          `echo '{"type":"result","result":"done","duration_ms":700}'`,
      ),
    );

    // Three and a half seconds of writing under a two second window. A total
    // deadline would have killed this run twice over; silence does not touch
    // it, because it was never silent for longer than a quarter of a second.
    expect(await ask({ ...ASK, silenceMs: 2000 })).toEqual({ text: 'done', durationMs: 700 });
    // Outliving a deadline is the whole claim, so this one outlives vitest's.
  }, 20_000);

  it('hands over the answer as it is written, not only once it is whole', async () => {
    const line = (text: string) =>
      `{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"${text}"}}}`;
    const seen: string[] = [];
    const ask = createClaudeCode(
      fakeBinary(
        `echo '${line('one ')}'; echo '${line('two')}';` +
          `echo '{"type":"result","result":"one two","duration_ms":5}'`,
      ),
    );

    await ask({ ...ASK, onPartial: (text) => seen.push(text) });

    expect(seen).toEqual(['one ', 'one two']);
  });

  it('stops when the reader stops it, and says so', async () => {
    const ask = createClaudeCode(fakeBinary('sleep 30'));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const result = failure(await ask({ ...ASK, signal: controller.signal }));

    expect(result.code).toBe('cancelled');
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
