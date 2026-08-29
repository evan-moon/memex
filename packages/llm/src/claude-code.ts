import { spawn } from 'node:child_process';
import type { LlmFailureCode, LlmProvider, LlmRequest, LlmResult } from './types.ts';

const ERROR_CHARS = 300;

// Long enough that a slow answer is not cut off, short enough that a machine
// with no route to Anthropic does not wait forever: the CLI does not report
// being offline, it simply never comes back.
const DEFAULT_TIMEOUT_MS = 120_000;

// The vault's own MCP server is stripped from every call this provider makes.
// These prompts read the vault to propose something about it, and a proposal
// that can write itself in is not a proposal.
const NO_TOOLS = ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];

const argsFor = ({ prompt, model }: LlmRequest) => [
  '-p',
  prompt,
  '--model',
  model,
  '--output-format',
  'json',
  ...NO_TOOLS,
];

// stdin is closed rather than left open: the CLI waits three seconds for input
// that is never coming, and a run that asks about sixty pairs pays that wait
// sixty times. The prompt travels in argv.
const ask = (request: LlmRequest, binary: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(binary, argsFor(request), { stdio: ['ignore', 'pipe', 'pipe'] });
    const settled = { done: false };

    // Settling on the decision rather than on the child's exit. A killed CLI
    // that left a process of its own behind holds the pipe open, and waiting
    // for a close that never comes is the hang this exists to end.
    const finish = (act: () => void) => {
      if (settled.done) return;
      settled.done = true;
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', cancel);
      act();
    };

    const stop = (code: LlmFailureCode, message: string) => {
      child.kill();
      finish(() => reject(Object.assign(new Error(message), { code })));
    };

    function cancel() {
      stop('cancelled', 'Stopped');
    }

    const timer = setTimeout(
      () => stop('timeout', 'Claude did not answer in time'),
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    request.signal?.addEventListener('abort', cancel, { once: true });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) =>
      finish(() => {
        // A refusal, a rate limit and a logged-out session all arrive as a JSON
        // envelope that says what happened, sometimes alongside a non-zero exit.
        // Reading it beats reporting the exit code the user cannot act on.
        if (code === 0 || stdout.trimStart().startsWith('{')) resolve(stdout);
        else reject(new Error(stderr.trim() || `${binary} exited with ${code}`));
      }),
    );
  });

type Envelope = {
  is_error?: boolean;
  result?: string;
  duration_ms?: number;
  api_error_status?: string | number | null;
};

// The envelope carries the HTTP status when there was a request to have one.
// Signing out is decided before any request is made, so it arrives with no
// status and only says so in the message.
const BY_STATUS: Record<string, LlmFailureCode> = {
  '401': 'logged-out',
  '403': 'quota',
  '404': 'model-refused',
  '429': 'quota',
};

export const classifyEnvelope = (envelope: {
  result?: string;
  api_error_status?: string | number | null;
}): LlmFailureCode => {
  const status = envelope.api_error_status;
  const byStatus = status === null || status === undefined ? undefined : BY_STATUS[String(status)];
  if (byStatus) return byStatus;
  return /not logged in/i.test(envelope.result ?? '') ? 'logged-out' : 'refused';
};

// The prompt is an argument, so a failure that echoes the command line puts the
// whole note on screen as if the note were the error.
const clip = (message: string) =>
  message.length > ERROR_CHARS ? `${message.slice(0, ERROR_CHARS)}…` : message;

const codeOf = (error: unknown): LlmFailureCode | undefined => {
  const carried = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
  if (carried === 'timeout' || carried === 'cancelled') return carried;
  const raw = error instanceof Error ? error.message : String(error);
  return raw.includes('ENOENT') ? 'not-installed' : undefined;
};

export const createClaudeCode = (binary = 'claude'): LlmProvider =>
  async function claudeCode(request): Promise<LlmResult> {
    try {
      const stdout = await ask(request, binary);
      const envelope = JSON.parse(stdout) as Envelope;
      if (envelope.is_error || !envelope.result) {
        return {
          error: envelope.result ?? 'Claude reported an error',
          code: classifyEnvelope(envelope),
        };
      }
      return { text: envelope.result, durationMs: envelope.duration_ms ?? 0 };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const code = codeOf(error);
      return code ? { error: clip(raw), code } : { error: clip(raw) };
    }
  };

export const claudeCode = createClaudeCode();
