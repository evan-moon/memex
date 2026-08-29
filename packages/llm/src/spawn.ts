import { spawn } from 'node:child_process';
import type { LlmFailureCode, LlmRequest } from './types.ts';

// Long enough that a slow answer is not cut off, short enough that a machine
// with no route to the provider does not wait forever: neither CLI reports being
// offline, they simply never come back.
const DEFAULT_TIMEOUT_MS = 120_000;

export type Ran = { stdout: string; stderr: string; code: number | null };

export const carriedCode = (error: unknown): LlmFailureCode | undefined => {
  const carried = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
  if (carried === 'timeout' || carried === 'cancelled') return carried;
  const raw = error instanceof Error ? error.message : String(error);
  return raw.includes('ENOENT') ? 'not-installed' : undefined;
};

// Both providers drive a CLI the same way: no stdin, a deadline, and a stop the
// reader can press. Written once so the two cannot drift into behaving
// differently at the edges — which is exactly what happened the last time four
// callers each assembled their own command line.
export const runCli = (
  binary: string,
  args: string[],
  request: Pick<LlmRequest, 'signal' | 'timeoutMs'>,
  cwd?: string,
): Promise<Ran> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
    const settled = { done: false };

    // Settling on the decision rather than on the child's exit. A killed CLI
    // that left a process of its own behind holds the pipe open, and waiting for
    // a close that never comes is the hang this exists to end.
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
      () => stop('timeout', 'The provider did not answer in time'),
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
    child.on('close', (code) => finish(() => resolve({ stdout, stderr, code })));
  });
