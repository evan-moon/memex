import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carriedCode, runCli } from './spawn.ts';
import type { LlmFailureCode, LlmProvider, LlmRequest, LlmResult } from './types.ts';

const ERROR_CHARS = 300;

// What the app is asking for is one answer, not an agent loose in a repository.
// `read-only` refuses the shell writes, `--ephemeral` leaves no session behind,
// and `--ignore-user-config` keeps the reader's own Codex instructions out of a
// prompt that is about their notes.
const CONTAINED = [
  'exec',
  '--ephemeral',
  '--skip-git-repo-check',
  '--ignore-user-config',
  '--sandbox',
  'read-only',
  '--color',
  'never',
];

const argsFor = (request: LlmRequest, answerPath: string) => [
  ...CONTAINED,
  '--output-last-message',
  answerPath,
  ...(request.model ? ['--model', request.model] : []),
  request.prompt,
];

type CodexError = { status?: number; error?: { message?: string } };

// Failures arrive as `ERROR: {json}` on stdout, carrying the HTTP status the
// request came back with. The last one is the one that stuck.
export const readCodexError = (output: string): CodexError | null => {
  const lines = output.split('\n').filter((line) => line.startsWith('ERROR: {'));
  const last = lines.at(-1);
  if (last === undefined) return null;
  try {
    return JSON.parse(last.slice('ERROR: '.length)) as CodexError;
  } catch {
    return null;
  }
};

const BY_STATUS: Record<string, LlmFailureCode> = {
  '401': 'logged-out',
  '403': 'quota',
  '404': 'model-refused',
  '429': 'quota',
};

export const classifyCodex = (failure: CodexError | null): LlmFailureCode => {
  const message = failure?.error?.message ?? '';
  // A model a ChatGPT account cannot use comes back 400, which on its own would
  // read as a malformed request. The message is what tells the two apart.
  if (/model is not supported|unknown model|model_not_found/i.test(message)) return 'model-refused';
  if (/not logged in|unauthorized|sign in/i.test(message)) return 'logged-out';
  const status = failure?.status;
  return (status === undefined ? undefined : BY_STATUS[String(status)]) ?? 'refused';
};

const clip = (message: string) =>
  message.length > ERROR_CHARS ? `${message.slice(0, ERROR_CHARS)}…` : message;

export const createCodex = (binary = 'codex'): LlmProvider =>
  async function codex(request): Promise<LlmResult> {
    // The answer comes back through a file rather than out of the event stream:
    // stdout carries the whole session, and picking the reply out of it is
    // guesswork the CLI already does.
    const dir = mkdtempSync(join(tmpdir(), 'memex-codex-'));
    const answerPath = join(dir, 'answer.txt');
    const started = Date.now();

    try {
      const ran = await runCli(binary, argsFor(request, answerPath), request, dir);
      const failure = readCodexError(ran.stdout + ran.stderr);
      if (failure !== null) {
        return {
          error: clip(failure.error?.message ?? 'Codex reported an error'),
          code: classifyCodex(failure),
        };
      }

      // Read defensively: a run that failed without an ERROR line leaves no
      // file, and letting that ENOENT reach the catch would report a CLI that is
      // installed as missing.
      const text = ((): string => {
        try {
          return readFileSync(answerPath, 'utf8').trim();
        } catch {
          return '';
        }
      })();
      if (text === '') {
        return {
          error: clip(ran.stderr.trim() || `codex exited with ${ran.code}`),
          code: 'refused',
        };
      }
      return { text, durationMs: Date.now() - started };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const code = carriedCode(error);
      return code ? { error: clip(raw), code } : { error: clip(raw) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

export const codex = createCodex();
