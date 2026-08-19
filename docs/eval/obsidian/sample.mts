import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

const usage = `Pick the queries both tools will answer.

  node --import tsx docs/eval/obsidian/sample.mts [--n 40] [--seed 7]

The golden set over-samples blog posts (77% of its answers, 19% of the corpus),
because generation stratified by folder and drained small strata hardest. Left
alone that would measure long-form articles and call it a vault. This resamples
to the corpus mix instead, and spreads the picks over where in the note the
answer lives.

Queries are fixed here, before either tool has been run.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const N = Number(arg('--n', '40'));
const ALL = process.argv.includes('--all');
const SEED = Number(arg('--seed', '7'));
const OUT = arg('--out', join(dirname(new URL(import.meta.url).pathname), 'golden-set.json'));

const VAULT_ROOT = '/Users/evan/Documents/Second Brain';

type EvalCase = { query: string; expect: number[]; pos?: string };

const db = new Database(join(homedir(), '.memex', 'memex.db'), { readonly: true });
const paths = new Map(
  (db.prepare('SELECT id, file_path FROM notes').all() as { id: number; file_path: string }[]).map(
    (r) => [r.id, r.file_path],
  ),
);
const titles = new Map(
  (db.prepare('SELECT id, title FROM notes').all() as { id: number; title: string }[]).map((r) => [
    r.id,
    r.title,
  ]),
);

const corpus = [...paths.values()];
const vaultShare = corpus.filter((p) => p.startsWith(VAULT_ROOT)).length / corpus.length;

const cases: EvalCase[] = JSON.parse(
  readFileSync(join(homedir(), '.memex', 'eval.json'), 'utf8'),
);

const sourceOf = (c: EvalCase) =>
  c.expect.every((id) => (paths.get(id) ?? '').startsWith(VAULT_ROOT)) ? 'notes' : 'blog';

const mulberry32 = (seed: number) => () => {
  const t = (seed += 0x6d2b79f5);
  const x = Math.imul(t ^ (t >>> 15), 1 | t);
  const y = x + Math.imul(x ^ (x >>> 7), 61 | x);
  return ((y ^ (y >>> 14)) >>> 0) / 4294967296;
};
const rand = mulberry32(SEED);
const shuffled = <T>(xs: T[]) =>
  xs
    .map((x) => [rand(), x] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x);

// Round-robin over answer position inside each source, so the split that
// exposed the truncation blind spot survives into a 40-query sample.
const drawFrom = (pool: EvalCase[], want: number): EvalCase[] => {
  const byPos = ['head', 'mid', 'tail', undefined].map((pos) =>
    shuffled(pool.filter((c) => c.pos === pos)),
  );
  const out: EvalCase[] = [];
  while (out.length < want && byPos.some((q) => q.length > 0)) {
    for (const queue of byPos) {
      if (out.length >= want) break;
      const next = queue.shift();
      if (next) out.push(next);
    }
  }
  return out;
};

const notes = cases.filter((c) => sourceOf(c) === 'notes');
const blog = cases.filter((c) => sourceOf(c) === 'blog');
const wantNotes = Math.min(notes.length, Math.round(N * vaultShare));
// --all trades representativeness for power: every query, blog-heavy mix and
// all. The bias hits both tools identically, so the paired comparison stays
// valid — but the composition has to be stated wherever the number is.
const picked = ALL ? cases : [...drawFrom(notes, wantNotes), ...drawFrom(blog, N - wantNotes)];

const golden = shuffled(picked).map((c, i) => ({
  index: i + 1,
  query: c.query,
  expect: c.expect,
  expectTitles: c.expect.map((id) => titles.get(id) ?? '(missing)'),
  pos: c.pos ?? null,
  source: sourceOf(c),
}));

writeFileSync(OUT, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');

const count = (key: 'source' | 'pos') =>
  golden.reduce<Record<string, number>>((acc, g) => {
    const k = String(g[key]);
    return { ...acc, [k]: (acc[k] ?? 0) + 1 };
  }, {});

console.log(`corpus is ${Math.round(vaultShare * 100)}% notes / ${Math.round((1 - vaultShare) * 100)}% blog`);
console.log(`sampled ${golden.length}: ${JSON.stringify(count('source'))} · positions ${JSON.stringify(count('pos'))}`);
console.log(`wrote ${OUT}`);
