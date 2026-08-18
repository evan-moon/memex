import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { semanticSearch } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { createReranker } from '@memex/rerank';
import { CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';

const usage = `Is the cross-encoder worth its latency?

  node --import tsx scripts/eval-rerank.mts [--sample 40]

Retrieves a wide pool once per case, then scores hit@1 / MRR for the
bi-encoder order and for the reranked order at several pool sizes and passage
lengths — so quality and cost can be read off the same table.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SAMPLE = Number(arg('--sample', '40'));
const MODELS = [
  { model: 'Xenova/bge-reranker-base', dtype: 'q8' },
  { model: 'onnx-community/bge-reranker-v2-m3-ONNX', dtype: 'q8' },
];
const POOLS = [10, 20];
const PASSAGE_CHARS = [400];

type EvalCase = { query: string; expect: number[]; pos?: string };

const cases: EvalCase[] = JSON.parse(
  readFileSync(join(homedir(), '.memex', 'eval.json'), 'utf8'),
).slice(-SAMPLE);

const client = openDb(CONFIG_DIR);
const embedder = await createEmbedder(MODEL_CACHE_DIR);


const pools = await cases.reduce(
  async (pending, c) => [
    ...(await pending),
    await semanticSearch(client, embedder, c.query, Math.max(...POOLS)),
  ],
  Promise.resolve<Awaited<ReturnType<typeof semanticSearch>>[]>([]),
);

const rankOf = (ids: number[], expect: number[]) => {
  const i = ids.findIndex((id) => expect.includes(id));
  return i === -1 ? null : i + 1;
};

const score = (ranks: (number | null)[]) => ({
  hit1: ranks.filter((r) => r === 1).length / ranks.length,
  hit5: ranks.filter((r) => r !== null && r <= 5).length / ranks.length,
  mrr: ranks.reduce<number>((acc, r) => acc + (r === null ? 0 : 1 / r), 0) / ranks.length,
});

const pct = (x: number) => `${Math.round(x * 100)}%`;

const base = score(cases.map((c, i) => rankOf(pools[i].map((r) => r.id), c.expect)));
console.log(`\n${cases.length} cases (last ${SAMPLE} of the golden set)\n`);
console.log(`bi-encoder only          hit@1 ${pct(base.hit1)} · hit@5 ${pct(base.hit5)} · MRR ${base.mrr.toFixed(3)}`);

for (const config of MODELS) {
  const rerank = await createReranker(MODEL_CACHE_DIR, config);
  for (const chars of PASSAGE_CHARS) {
   for (const pool of POOLS) {
    const started = process.hrtime.bigint();
    const ranks = await cases.reduce(
      async (pending, c, i) => {
        const done = await pending;
        const candidates = pools[i].slice(0, pool);
        const scores = await rerank(
          c.query,
          candidates.map((n) => `${n.title}\n\n${(n.matchSnippet ?? n.content).slice(0, chars)}`),
        );
        const ordered = candidates
          .map((n, j) => ({ id: n.id, score: scores[j] ?? 0 }))
          .sort((a, b) => b.score - a.score)
          .map((n) => n.id);
        return [...done, rankOf(ordered, c.expect)];
      },
      Promise.resolve<(number | null)[]>([]),
    );
    const ms = Number(process.hrtime.bigint() - started) / 1e6 / cases.length;
    const s = score(ranks);
    console.log(
      `${config.model.split('/')[1].padEnd(30)} pool=${String(pool).padStart(2)}  hit@1 ${pct(s.hit1)} · hit@5 ${pct(s.hit5)} · MRR ${s.mrr.toFixed(3)}  ${ms.toFixed(0)}ms/query`,
    );
   }
  }
}
