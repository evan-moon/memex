import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyCodex, createCodex, readCodexError } from './codex.ts';
import type { LlmFailure, LlmRequest } from './types.ts';

let dir: string;

const ASK: LlmRequest = { prompt: 'say something', model: '' };

const fakeBinary = (script: string) => {
  const path = join(dir, 'fake-codex');
  writeFileSync(path, `#!/bin/sh\n${script}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
};

const failure = (result: unknown) => result as LlmFailure;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-codex-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('reading what Codex answered', () => {
  // The answer comes back through the file the CLI was told to write, not out of
  // the session it prints, which is full of everything else that happened.
  it('takes the answer from the file rather than from the transcript', async () => {
    const ask = createCodex(
      fakeBinary(`
        for a in "$@"; do
          if [ "$prev" = "--output-last-message" ]; then printf '%s' '{"action":"none"}' > "$a"; fi
          prev="$a"
        done
        echo "thinking out loud"
      `),
    );

    expect(await ask(ASK)).toMatchObject({ text: '{"action":"none"}' });
  });

  it('sends the model only when one was asked for', async () => {
    const argv = join(dir, 'argv.txt');
    const write = `for a in "$@"; do if [ "$prev" = "--output-last-message" ]; then printf ok > "$a"; fi; prev="$a"; done; printf '%s\\n' "$@" > ${argv}`;

    await createCodex(fakeBinary(write))(ASK);
    expect(readFileSync(argv, 'utf8')).not.toContain('--model');

    await createCodex(fakeBinary(write))({ ...ASK, model: 'gpt-5' });
    expect(readFileSync(argv, 'utf8')).toContain('gpt-5');
  });

  // Every one of these is a line the real CLI printed.
  it('tells apart the reasons a reader would act on differently', () => {
    const of = (body: string) => classifyCodex(readCodexError(`ERROR: ${body}`));

    expect(
      of(
        '{"type":"error","status":400,"error":{"message":"The \'x\' model is not supported when using Codex with a ChatGPT account."}}',
      ),
    ).toBe('model-refused');
    expect(of('{"status":401,"error":{"message":"unauthorized"}}')).toBe('logged-out');
    expect(of('{"status":429,"error":{"message":"slow down"}}')).toBe('quota');
    expect(of('{"status":500,"error":{"message":"boom"}}')).toBe('refused');
    expect(readCodexError('nothing here')).toBeNull();
  });

  it('reports what the CLI said rather than the exit code', async () => {
    const ask = createCodex(
      fakeBinary(`echo 'ERROR: {"status":429,"error":{"message":"rate limited"}}'; exit 1`),
    );

    const result = failure(await ask(ASK));
    expect(result.code).toBe('quota');
    expect(result.error).toContain('rate limited');
  });

  // A run that fails without an ERROR line leaves no answer file. Letting that
  // ENOENT escape would report a CLI that is installed as missing.
  it('does not call a missing answer a missing CLI', async () => {
    const ask = createCodex(fakeBinary('echo "died quietly" >&2; exit 3'));

    expect(failure(await ask(ASK)).code).toBe('refused');
  });

  it('says the provider is missing when it really is', async () => {
    expect(failure(await createCodex(join(dir, 'nothing-here'))(ASK)).code).toBe('not-installed');
  });

  it('stops when the reader stops it', async () => {
    const ask = createCodex(fakeBinary('sleep 30'));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    expect(failure(await ask({ ...ASK, signal: controller.signal })).code).toBe('cancelled');
  });
});
