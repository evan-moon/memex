import { spawn } from 'node:child_process';
import type { LlmFailureCode, LlmRequest } from './types.ts';

// Silence, not duration. A total deadline has to be set to the longest answer
// anyone is willing to wait for, and then it kills the ones that take longer —
// which is how a draft that took seven minutes came back as a timeout. What
// separates a slow answer from a machine with no route to the provider is that
// one of them is still talking: neither CLI reports being offline, they simply
// go quiet and never come back.
const DEFAULT_SILENCE_MS = 120_000;

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
  request: Pick<LlmRequest, 'signal' | 'silenceMs'>,
  cwd?: string,
  onOut?: (chunk: string) => void,
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
      clearTimeout(quiet.timer);
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

    const silence = request.silenceMs ?? DEFAULT_SILENCE_MS;
    const wait = () => setTimeout(() => stop('timeout', 'The provider went quiet'), silence);
    const quiet = { timer: wait() };

    // Every byte the child produces buys it another window, so a run that is
    // writing keeps its turn for as long as it keeps writing.
    const heard = () => {
      if (settled.done) return;
      clearTimeout(quiet.timer);
      quiet.timer = wait();
    };

    request.signal?.addEventListener('abort', cancel, { once: true });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      heard();
      onOut?.(text);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      heard();
    });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => finish(() => resolve({ stdout, stderr, code })));
  });
