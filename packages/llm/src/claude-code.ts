import { createLineReader } from './lines.ts';
import { carriedCode, runCli } from './spawn.ts';
import type { LlmFailureCode, LlmProvider, LlmRequest, LlmResult } from './types.ts';

const ERROR_CHARS = 300;

// The vault's own MCP server is stripped from every call this provider makes.
// These prompts read the vault to propose something about it, and a proposal
// that can write itself in is not a proposal.
const NO_TOOLS = ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];

// A single JSON object arrives only once the whole answer is written, which
// leaves nothing to show for the wait and nothing to tell a CLI that is working
// from one that is gone. The stream says both: every partial message is proof
// of life and a piece of the answer.
const STREAMED = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages'];

// The prompt travels in argv and stdin stays closed: left open, the CLI waits
// three seconds for input that is never coming, and a run that asks about sixty
// pairs pays that wait sixty times.
const argsFor = ({ prompt, model }: LlmRequest) => [
  '-p',
  prompt,
  '--model',
  model,
  ...STREAMED,
  ...NO_TOOLS,
];

type Envelope = {
  is_error?: boolean;
  result?: string;
  duration_ms?: number;
  api_error_status?: string | number | null;
};

const parsed = (line: string): Record<string, unknown> | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
};

// The verdict is the last event that carries one. Reading it out of the stream
// rather than off the whole of stdout is what lets the same provider read a
// stream of events and a single object, so a fixture written as one object is
// still a run this understands.
export const envelopeOf = (stdout: string): Envelope | null =>
  stdout
    .split('\n')
    .flatMap((line) => {
      const event = parsed(line);
      return event === null || !('result' in event || 'is_error' in event)
        ? []
        : [event as Envelope];
    })
    .at(-1) ?? null;

type Delta = { event?: { delta?: { text?: string } } };

// Only the text the model is writing. The stream also carries what it costs and
// how it is configured, and neither is the answer.
const deltaOf = (line: string): string => {
  const event = parsed(line) as Delta | null;
  const text = event?.event?.delta?.text;
  return typeof text === 'string' ? text : '';
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

export const createClaudeCode = (binary = 'claude'): LlmProvider =>
  async function claudeCode(request): Promise<LlmResult> {
    const written = { text: '' };
    const read = createLineReader((line) => {
      const delta = deltaOf(line);
      if (delta === '') return;
      written.text += delta;
      request.onPartial?.(written.text);
    });

    try {
      const ran = await runCli(binary, argsFor(request), request, undefined, read);
      // A refusal, a rate limit and a logged-out session all arrive as a JSON
      // envelope that says what happened, sometimes alongside a non-zero exit.
      // Reading it beats reporting the exit code the user cannot act on.
      const envelope = envelopeOf(ran.stdout);
      if (envelope === null) {
        throw new Error(ran.stderr.trim() || `${binary} exited with ${ran.code}`);
      }
      if (envelope.is_error || !envelope.result) {
        return {
          error: envelope.result ?? 'Claude reported an error',
          code: classifyEnvelope(envelope),
        };
      }
      return { text: envelope.result, durationMs: envelope.duration_ms ?? 0 };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const code = carriedCode(error);
      return code ? { error: clip(raw), code } : { error: clip(raw) };
    }
  };

export const claudeCode = createClaudeCode();
