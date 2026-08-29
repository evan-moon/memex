import { isLlmFailure, type LlmModel } from '@memex/llm';
import { askClaude } from './llm.ts';

export type DraftSource = {
  title: string;
  body: string;
  since: string;
  newer: { id: number; title: string; body: string }[];
};

export type DraftChange = { text: string; from: number[] };

// Three different answers the panel must not blur together: it rewrote and
// said why, it read the newer notes and concluded nothing needed changing, or
// it rewrote without explaining itself.
export type DraftVerdict = 'changed' | 'no-change' | 'unexplained';

export type Draft =
  | {
      body: string;
      changes: DraftChange[];
      verdict: DraftVerdict;
      reason: string;
      durationMs: number;
    }
  | { error: string; code?: 'no-claude' };

const MODEL: LlmModel = 'sonnet';
// A delimiter rather than JSON: the body is long Markdown with its own quotes,
// backticks and newlines, and asking a model to escape all of that into a
// string field fails far more often than asking it for a line.
const SPLIT = '<<<CHANGES>>>';
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

=== CURRENT STATE NOTE: ${title} ===
${clip(body)}

${newer.map((n) => `=== NEWER NOTE #${n.id}: ${n.title} ===\n${clip(n.body)}`).join('\n\n')}

=== OUTPUT FORMAT (follow exactly) ===
Reply with the rewritten body as raw Markdown — no preamble, no code fence.
Then the line ${SPLIT} on its own.
Then one bullet per change, each starting with the note id that caused it:

${SPLIT}
- [#${newer[0]?.id ?? 1234}] what you changed, and what in that note made the old wording wrong or incomplete
- [#${newer[1]?.id ?? 5678}] ...

Write the bullets in the note's language. If you changed nothing, the only bullet is "- 바꿀 것 없음".
This second section is required; a reply without it is incomplete.`;

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

// A rewrite the reader cannot check is a rewrite they have to trust. Each line
// names the note it came from, so "why is this better" is answerable by
// opening that note rather than by believing the diff.
// The model reports "nothing to change" with its reasoning attached more often
// than bare, and that reasoning is the most useful thing it produces: it says
// why the notes the detector thought were related actually are not.
// The lookahead rather than \b: \b is defined over ASCII word characters, so
// it never fires after a Hangul syllable and the phrase would never match.
const NO_CHANGE = /^(바꿀 것 없음|no change|nothing to change)(?=$|[\s(:—-])[\s:—-]*/i;

const stripIds = (line: string) => line.replace(/^\[?#\d+(?:[,\s]+#\d+)*\]?[ \t:—-]*/, '').trim();

const unwrap = (text: string) => text.replace(/^\((.*)\)$/s, '$1').trim();

export const parseDraft = (
  raw: string,
  sourceBody: string,
): { body: string; changes: DraftChange[]; verdict: DraftVerdict; reason: string } => {
  const at = raw.indexOf(SPLIT);
  const body = normalizeDraft(at === -1 ? raw : raw.slice(0, at), sourceBody);
  const nothing = { body, changes: [], verdict: 'unexplained' as const, reason: '' };
  if (at === -1) return nothing;

  const entries = raw
    .slice(at + SPLIT.length)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[ \t]*[-*][ \t]*/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      from: [...line.matchAll(/#(\d+)/g)].map((m) => Number(m[1])),
      text: stripIds(line),
    }))
    .filter((entry) => entry.text.length > 0);

  if (entries.length === 0) return nothing;

  if (entries.every((entry) => NO_CHANGE.test(entry.text))) {
    return {
      body,
      changes: [],
      verdict: 'no-change',
      reason: unwrap(
        entries
          .map((entry) => entry.text.replace(NO_CHANGE, ''))
          .join(' ')
          .trim(),
      ),
    };
  }

  const changes = entries.filter((entry) => !NO_CHANGE.test(entry.text));
  return changes.length === 0 ? nothing : { body, changes, verdict: 'changed', reason: '' };
};

// The drafting call runs without the vault's own tools: a proposal that can
// write itself into what it is reading is not a proposal. That boundary now
// lives in the provider (`@memex/llm`), not in this file.
export const draftStateUpdate = async (source: DraftSource): Promise<Draft> => {
  const answer = await askClaude({ prompt: buildPrompt(source), model: MODEL });
  if (isLlmFailure(answer)) {
    return answer.code === 'not-installed'
      ? { error: answer.error, code: 'no-claude' }
      : { error: answer.error };
  }

  const { body, changes, verdict, reason } = parseDraft(answer.text, source.body);
  return {
    body: `${body}\n`,
    changes,
    verdict,
    reason,
    durationMs: answer.durationMs,
  };
};
