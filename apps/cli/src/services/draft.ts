import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type DraftSource = {
  title: string;
  body: string;
  since: string;
  newer: { id: number; title: string; body: string }[];
};

export type Draft = { body: string; cost: number } | { error: string };

const MODEL = 'sonnet';
const MAX_NOTE_CHARS = 6000;

const clip = (text: string) =>
  text.length <= MAX_NOTE_CHARS ? text : `${text.slice(0, MAX_NOTE_CHARS)}\n\n[...]`;

const buildPrompt = ({
  title,
  body,
  since,
  newer,
}: DraftSource) => `You maintain a personal second brain written mostly in Korean.

Below is a "state" note — what its owner currently believes about a subject — followed by the notes written AFTER it was last updated on ${since}. Your job is to rewrite the state note so it says what is true now.

Rules:
- Write in the note's own language and voice. Match its heading structure and level of detail.
- Change only what the newer notes actually contradict, supersede, or add. Leave every untouched claim byte-identical, including its wording.
- Do not invent. If a newer note only partly answers something, say what it establishes and leave the rest.
- Keep it a state note: it describes what holds now, not a log of what happened. Do not add "as of <date>" or a changelog section.
- Do not repeat the title as a heading. Start with the body.
- Output the rewritten body as raw Markdown and nothing else — no preamble, no code fence, no explanation.

=== CURRENT STATE NOTE: ${title} ===
${clip(body)}

${newer.map((n) => `=== NEWER NOTE #${n.id}: ${n.title} ===\n${clip(n.body)}`).join('\n\n')}`;

const unfence = (text: string) => {
  const fenced = /^```(?:markdown|md)?\r?\n([\s\S]*?)\r?\n```\s*$/.exec(text.trim());
  return (fenced ? fenced[1] : text).trim();
};

const LEADING_HEADING = /^#[ \t]+/;

// The prompt asks for the body alone, and the model still opens with the title
// as an H1 often enough to matter — the file already carries one, so a draft
// that keeps its own gives the note two headings. But some bodies really do
// start with a heading of their own, and there the model is right to echo it.
// The source decides, not the draft.
export const normalizeDraft = (raw: string, sourceBody: string): string => {
  const text = unfence(raw);
  return LEADING_HEADING.test(sourceBody) ? text : text.replace(/^#[ \t]+.*\r?\n+/, '');
};

// Headless Claude with its MCP servers stripped: the drafting call must not be
// able to reach back into memex and write while it is still a proposal.
export const draftStateUpdate = async (source: DraftSource): Promise<Draft> => {
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
      total_cost_usd?: number;
    };
    if (envelope.is_error || !envelope.result) {
      return { error: envelope.result ?? 'Claude reported an error' };
    }
    return {
      body: `${normalizeDraft(envelope.result, source.body)}\n`,
      cost: envelope.total_cost_usd ?? 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: message.includes('ENOENT')
        ? 'claude CLI를 찾을 수 없어. 초안을 만들려면 Claude Code가 PATH에 있어야 해.'
        : message,
    };
  }
};
