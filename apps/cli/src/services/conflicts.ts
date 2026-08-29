import { isLlmFailure, type LlmModel } from '@memex/llm';
import { askClaude } from './llm.ts';

const MODEL: LlmModel = 'sonnet';
const MAX_NOTE_CHARS = 4000;

export type ConflictSide = { id: number; title: string; body: string; at: string };

export type Verdict = 'contradiction' | 'same' | 'complement' | 'unrelated';

export type Judgement =
  | { verdict: Verdict; explanation: string; durationMs: number }
  | { error: string; code?: 'no-claude' };

const clip = (text: string) =>
  text.length <= MAX_NOTE_CHARS ? text : `${text.slice(0, MAX_NOTE_CHARS)}\n\n[...]`;

// The four answers are given as a closed set because the interesting failure is
// not "the model missed a contradiction", it is "the model called every pair of
// related notes a contradiction". Naming the three innocent shapes out loud is
// what keeps agreement and overlap from being reported as conflict.
export const buildPrompt = (a: ConflictSide, b: ConflictSide) =>
  `You audit a personal second brain written mostly in Korean.

Two of its judgements are below. Decide how they relate. Answer with exactly one
of these words on the first line, then one sentence explaining the choice.

  CONTRADICTION  acting on both is impossible, or one asserts what the other denies
  SAME           they say the same thing; one is a duplicate of the other
  COMPLEMENT     both hold at once; one refines, scopes or extends the other
  UNRELATED      they are about different subjects and never meet

Judging on tone or on how differently they are worded is the mistake to avoid.
Two notes may sound opposed and still both hold, and two notes may sound alike
and still disagree on what to do. Decide on what each one commits you to.
If one supersedes the other in time but they cannot both be followed, that is
CONTRADICTION, and say which one reads as the later position.

Write the explanation in Korean.

--- A: #${a.id} "${a.title}" (${a.at}) ---
${clip(a.body)}

--- B: #${b.id} "${b.title}" (${b.at}) ---
${clip(b.body)}
`;

const VERDICTS: Verdict[] = ['contradiction', 'same', 'complement', 'unrelated'];

export const parseJudgement = (raw: string): { verdict: Verdict; explanation: string } | null => {
  const lines = raw
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const head = lines[0].toLowerCase();
  const verdict = VERDICTS.find((word) => head.startsWith(word));
  if (!verdict) return null;

  const rest = lines[0].slice(verdict.length).replace(/^[\s:.—-]+/, '');
  const explanation = [rest, ...lines.slice(1)]
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();
  return { verdict, explanation };
};

export const judgeConflict = async (a: ConflictSide, b: ConflictSide): Promise<Judgement> => {
  const answer = await askClaude({ prompt: buildPrompt(a, b), model: MODEL });
  if (isLlmFailure(answer)) {
    return answer.code === 'not-installed'
      ? { error: answer.error, code: 'no-claude' }
      : { error: answer.error };
  }

  const parsed = parseJudgement(answer.text);
  return parsed
    ? { ...parsed, durationMs: answer.durationMs }
    : { error: `Could not read a verdict from: ${answer.text.slice(0, 200)}` };
};
