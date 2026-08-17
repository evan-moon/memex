import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { semanticSearch } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';

const usage = `Turn the golden set's single-answer labels into graded relevance.

  node --import tsx scripts/grade-eval.mts [--limit <n>] [--model sonnet] [--apply]

For every case it runs the current search, shows Claude the top hits, and asks
how well each one answers the query (2 fully / 1 partly / 0 not at all). The
grades land in each case's "graded" map, which nDCG and recall then use instead
of the single expected id — so a second note that answers just as well stops
counting as a miss.

Only notes the current engine retrieves can be graded, so re-run this after a
retrieval change that widens the candidate pool. Cases where Claude grades the
expected note 0 are reported as suspect: those are generation errors worth
deleting by hand.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const FILE = arg('--file', join(homedir(), '.memex', 'eval.json'));
const MODEL = arg('--model', 'sonnet');
const POOL = Number(arg('--pool', '10'));
const CONCURRENCY = Number(arg('--concurrency', '6'));
const LIMIT = Number(arg('--limit', '0'));
const APPLY = process.argv.includes('--apply');

const execFileAsync = promisify(execFile);

type EvalCase = {
  query: string;
  expect: number[];
  pos?: string;
  graded?: Record<number, number>;
};

const buildPrompt = (
  query: string,
  hits: { id: number; title: string; snippet: string }[],
): string => `A user searched a personal second brain with this query:

"${query}"

Grade how well each retrieved note answers that query:
  2 = answers it directly
  1 = related, gives partial context, but is not the answer
  0 = does not answer it

Judge the note by whether its content addresses the query, not by keyword overlap.
Be strict about 2: only a note that actually contains the answer earns it.

Output strict JSON, nothing else: {"grades":{"<note id>":2,"<note id>":0}}

${hits.map((h) => `#${h.id} "${h.title}"\n${h.snippet}`).join('\n\n')}`;

const parseGrades = (raw: string): Record<number, number> => {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  const data = JSON.parse(match[0]) as { grades?: Record<string, number> };
  return Object.entries(data.grades ?? {}).reduce<Record<number, number>>(
    (acc, [id, grade]) => ({ ...acc, [Number(id)]: Math.max(0, Math.min(2, Math.round(grade))) }),
    {},
  );
};

const askClaude = async (prompt: string) => {
  const { stdout } = await execFileAsync(
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
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const envelope = JSON.parse(stdout) as {
    is_error?: boolean;
    result: string;
    total_cost_usd?: number;
  };
  if (envelope.is_error) throw new Error(envelope.result);
  return { grades: parseGrades(envelope.result), cost: envelope.total_cost_usd ?? 0 };
};

const runPool = async <T, R>(items: T[], worker: (item: T) => Promise<R>, size: number) => {
  const results: R[] = [];
  const queue = [...items.entries()];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const [index, item] = next;
        results[index] = await worker(item);
      }
    }),
  );
  return results;
};

const cases: EvalCase[] = JSON.parse(readFileSync(FILE, 'utf8'));
const targets = LIMIT > 0 ? cases.slice(0, LIMIT) : cases;

const client = openDb(CONFIG_DIR);
const embedder = await createEmbedder(MODEL_CACHE_DIR);

console.log(`grading ${targets.length} cases · pool ${POOL} · model ${MODEL}`);

const pools = await targets.reduce(
  async (pending, c) => {
    const done = await pending;
    const hits = await semanticSearch(client, embedder, c.query, POOL);
    return [
      ...done,
      hits.map((h) => ({
        id: h.id,
        title: h.title,
        snippet: (h.matchSnippet ?? h.content).replace(/\s+/g, ' ').slice(0, 300),
      })),
    ];
  },
  Promise.resolve<{ id: number; title: string; snippet: string }[][]>([]),
);

const state = { done: 0, spent: 0 };
const graded = await runPool(
  targets.map((c, i) => ({ c, hits: pools[i] })),
  async ({ c, hits }) => {
    if (hits.length === 0) return {};
    try {
      const { grades, cost } = await askClaude(buildPrompt(c.query, hits));
      state.spent += cost;
      state.done += 1;
      process.stdout.write(`\r${state.done}/${targets.length} · $${state.spent.toFixed(2)}`);
      return grades;
    } catch (error) {
      state.done += 1;
      process.stderr.write(`\ngrading failed for "${c.query}": ${(error as Error).message}\n`);
      return {};
    }
  },
  CONCURRENCY,
);

const merged = cases.map((c, i) => {
  const grades = graded[i];
  if (!grades || Object.keys(grades).length === 0) return c;
  return {
    ...c,
    graded: { ...c.graded, ...grades, ...Object.fromEntries(c.expect.map((id) => [id, 2])) },
  };
});

const suspect = targets.filter((c, i) => graded[i] && c.expect.some((id) => graded[i][id] === 0));
const extraAnswers = targets.filter(
  (c, i) => graded[i] && Object.entries(graded[i]).some(([id, g]) => g === 2 && !c.expect.includes(Number(id))),
);

console.log(`\n\ngraded ${targets.length} cases · $${state.spent.toFixed(2)}`);
console.log(`cases with another fully-correct answer: ${extraAnswers.length}`);
console.log(`suspect cases (expected note graded 0): ${suspect.length}`);
for (const c of suspect.slice(0, 10)) console.log(`  ${c.query} → #${c.expect[0]}`);

if (!APPLY) {
  console.log(`\n(dry run — pass --apply to write ${FILE})`);
  process.exit(0);
}

writeFileSync(FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(`\n✓ wrote ${FILE}`);
