import type { NoteShapeKind } from '@memex/db';
import { claudeCode, isLlmFailure, type LlmModel } from '@memex/llm';

export const CLAIM_MODEL: LlmModel = 'sonnet';
const MAX_NOTE_CHARS = 8000;

export type ClaimSource = { id: number; title: string; body: string };

export type Extraction =
  | { kind: NoteShapeKind; claims: string[]; durationMs: number }
  | { error: string; code?: 'no-claude' };

export const isExtractionError = (result: Extraction): result is { error: string } =>
  'error' in result;

const clip = (text: string) =>
  text.length <= MAX_NOTE_CHARS ? text : `${text.slice(0, MAX_NOTE_CHARS)}\n\n[...]`;

const buildPrompt = (note: ClaimSource) =>
  `Below is a "state" note from a personal second brain: a note recording positions its author currently holds, written mostly in Korean.

Some of these notes argue a position. Others are indexes — a roster of pointers to other notes, a changelog, a status board — which assert nothing of their own and cannot sensibly be asked "what is this built on?".

Decide which this note is, then, if it argues a position, list the distinct claims it makes that someone could ask for evidence for.

Rules:
- A claim is one assertion the author would have to defend. Not a heading, not a task, not a pointer to another note.
- Write each claim as one sentence in the note's own language.
- List the load-bearing claims only. If you find yourself past 5, this note is almost certainly an index.
- Output raw JSON only, no code fence:
  {"kind":"position","claims":["...","..."]}
  or
  {"kind":"index","claims":[]}

=== NOTE #${note.id}: ${note.title} ===
${clip(note.body)}`;

export const parseExtraction = (raw: string): { kind: NoteShapeKind; claims: string[] } | null => {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { kind?: unknown; claims?: unknown };
    if (parsed.kind !== 'position' && parsed.kind !== 'index') return null;
    if (!Array.isArray(parsed.claims)) return null;
    const claims = parsed.claims.filter((c): c is string => typeof c === 'string' && c.length > 0);
    return { kind: parsed.kind, claims };
  } catch {
    return null;
  }
};

export const extractClaims = async (note: ClaimSource): Promise<Extraction> => {
  const answer = await claudeCode({ prompt: buildPrompt(note), model: CLAIM_MODEL });
  if (isLlmFailure(answer)) {
    return answer.code === 'not-installed'
      ? { error: answer.error, code: 'no-claude' }
      : { error: answer.error };
  }

  const parsed = parseExtraction(answer.text);
  return parsed
    ? { ...parsed, durationMs: answer.durationMs }
    : { error: 'Claude did not answer in the requested shape' };
};
