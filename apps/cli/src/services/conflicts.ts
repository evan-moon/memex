import { spawn } from 'node:child_process';

const MODEL = 'sonnet';
const ERROR_CHARS = 300;
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

// stdin is closed rather than left open: the CLI waits three seconds for input
// that is never coming, and a run that asks about sixty pairs pays that wait
// sixty times. The prompt travels in argv.
const ask = (prompt: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(
      'claude',
      [
        '-p',
        prompt,
        '--model',
        MODEL,
        '--output-format',
        'json',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

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
      else reject(new Error(stderr.trim() || `claude exited with ${code}`));
    });
  });

export const judgeConflict = async (a: ConflictSide, b: ConflictSide): Promise<Judgement> => {
  try {
    const stdout = await ask(buildPrompt(a, b));
    const envelope = JSON.parse(stdout) as {
      is_error?: boolean;
      result?: string;
      duration_ms?: number;
    };
    if (envelope.is_error || !envelope.result) {
      return { error: envelope.result ?? 'Claude reported an error' };
    }
    const parsed = parseJudgement(envelope.result);
    if (!parsed)
      return { error: `Could not read a verdict from: ${envelope.result.slice(0, 200)}` };
    return { ...parsed, durationMs: envelope.duration_ms ?? 0 };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // The prompt is an argument, so a failure that echoes the command line puts
    // both notes on screen as if they were the error.
    const message = raw.length > ERROR_CHARS ? `${raw.slice(0, ERROR_CHARS)}…` : raw;
    return raw.includes('ENOENT') ? { error: message, code: 'no-claude' } : { error: message };
  }
};
