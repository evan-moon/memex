import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const MODEL = 'sonnet';
const SPLIT = '<<<SUMMARY>>>';
const MAX_NOTE_CHARS = 6000;

export type RedraftSource = {
  title: string;
  summary: string;
  notes: { id: number; title: string; body: string }[];
};

export type Redraft =
  | { title: string; summary: string; durationMs: number }
  | { error: string; code?: 'no-claude' };

const clip = (text: string) =>
  text.length <= MAX_NOTE_CHARS ? text : `${text.slice(0, MAX_NOTE_CHARS)}\n\n[...]`;

const buildPrompt = ({ title, summary, notes }: RedraftSource) =>
  `You are re-reading a hypothesis about a personal second brain written mostly in Korean.

Below is a hypothesis that was synthesised from a set of notes, followed by those notes as they read TODAY. Some of them have changed since. Rewrite the hypothesis so it says what these notes now support.

Rules:
- Write in the hypothesis's own language and voice.
- Change only what the notes no longer support, or what they now support and the hypothesis missed. Keep everything still true as it was written.
- Stay a hypothesis about the whole set, not a summary of any single note.
- Do not invent. If the notes no longer support a claim, drop it rather than soften it.

=== CURRENT HYPOTHESIS: ${title} ===
${clip(summary)}

${notes.map((n) => `=== NOTE #${n.id}: ${n.title} ===\n${clip(n.body)}`).join('\n\n')}

=== OUTPUT FORMAT (follow exactly) ===
One line: the hypothesis title.
Then the line ${SPLIT} on its own.
Then the rewritten hypothesis as raw Markdown — no preamble, no code fence.`;

export const parseRedraft = (raw: string): { title: string; summary: string } | null => {
  const at = raw.indexOf(SPLIT);
  if (at === -1) return null;
  const title = raw
    .slice(0, at)
    .trim()
    .replace(/^#+\s*/, '');
  const summary = raw.slice(at + SPLIT.length).trim();
  return title.length > 0 && summary.length > 0 ? { title, summary } : null;
};

// Same shape as the state-note draft: headless, with its MCP servers stripped
// so a proposal cannot write itself into the vault it is reading.
export const redraftInference = async (source: RedraftSource): Promise<Redraft> => {
  try {
    const { stdout } = await run(
      'claude',
      [
        '-p',
        buildPrompt(source),
        '--model',
        MODEL,
        '--output-format',
        'json',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const envelope = JSON.parse(stdout) as {
      is_error?: boolean;
      result?: string;
      duration_ms?: number;
    };
    if (envelope.is_error || !envelope.result) {
      return { error: envelope.result ?? 'Claude reported an error' };
    }
    const parsed = parseRedraft(envelope.result);
    return parsed
      ? { ...parsed, durationMs: envelope.duration_ms ?? 0 }
      : { error: 'Claude did not answer in the requested shape' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('ENOENT') ? { error: message, code: 'no-claude' } : { error: message };
  }
};
