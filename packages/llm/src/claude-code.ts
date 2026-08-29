import { spawn } from 'node:child_process';
import type { LlmProvider, LlmRequest, LlmResult } from './types.ts';

const ERROR_CHARS = 300;

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

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      // A refusal, a rate limit and a logged-out session all arrive as a JSON
      // envelope that says what happened, sometimes alongside a non-zero exit.
      // Reading it beats reporting the exit code the user cannot act on.
      if (code === 0 || stdout.trimStart().startsWith('{')) resolve(stdout);
      else reject(new Error(stderr.trim() || `${binary} exited with ${code}`));
    });
  });

type Envelope = { is_error?: boolean; result?: string; duration_ms?: number };

// The prompt is an argument, so a failure that echoes the command line puts the
// whole note on screen as if the note were the error.
const clip = (message: string) =>
  message.length > ERROR_CHARS ? `${message.slice(0, ERROR_CHARS)}…` : message;

export const createClaudeCode = (binary = 'claude'): LlmProvider =>
  async function claudeCode(request): Promise<LlmResult> {
    try {
      const stdout = await ask(request, binary);
      const envelope = JSON.parse(stdout) as Envelope;
      if (envelope.is_error || !envelope.result) {
        return { error: envelope.result ?? 'Claude reported an error' };
      }
      return { text: envelope.result, durationMs: envelope.duration_ms ?? 0 };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      return raw.includes('ENOENT')
        ? { error: clip(raw), code: 'not-installed' }
        : { error: clip(raw) };
    }
  };

export const claudeCode = createClaudeCode();
