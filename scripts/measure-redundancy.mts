import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { semanticSearch } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';

const usage = `How much of a result page is the same note wearing different dates?

  node --import tsx scripts/measure-redundancy.mts [--limit 5] [--sample 200]

Counts result slots lost to near-duplicates two ways: notes whose titles share
a long prefix (a dated series like "opula 세션 인계 2026-08-13"), and notes whose
vectors sit within a small cosine distance of a higher-ranked result.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const LIMIT = Number(arg('--limit', '5'));
const SAMPLE = Number(arg('--sample', '200'));
const PREFIX = Number(arg('--prefix', '16'));
const NEAR = Number(arg('--near', '0.12'));

type EvalCase = { query: string };

const cases: EvalCase[] = JSON.parse(
  readFileSync(join(homedir(), '.memex', 'eval.json'), 'utf8'),
).slice(0, SAMPLE);

const client = openDb(CONFIG_DIR);
const embedder = await createEmbedder(MODEL_CACHE_DIR);

const vectorOf = client.sqlite.prepare(
  'SELECT embedding FROM note_embeddings WHERE note_id = ?',
);

const readVector = (id: number): Float32Array | null => {
  const row = vectorOf.get(BigInt(id)) as { embedding: Buffer } | undefined;
  return row ? new Float32Array(row.embedding.buffer, row.embedding.byteOffset, 768) : null;
};

const cosineDistance = (a: Float32Array, b: Float32Array): number =>
  1 - a.reduce((acc, v, i) => acc + v * b[i], 0);

const stats = await cases.reduce(
  async (pending, c) => {
    const acc = await pending;
    const hits = await semanticSearch(client, embedder, c.query, LIMIT);
    const prefixes = hits.map((h) => h.title.slice(0, PREFIX));
    const seriesDupes = prefixes.filter((p, i) => prefixes.indexOf(p) < i).length;

    const vectors = hits.map((h) => readVector(h.id));
    const nearDupes = vectors.filter((v, i) => {
      if (!v) return false;
      return vectors.slice(0, i).some((other) => other && cosineDistance(v, other) < NEAR);
    }).length;

    return {
      slots: acc.slots + hits.length,
      series: acc.series + seriesDupes,
      near: acc.near + nearDupes,
      pagesWithSeries: acc.pagesWithSeries + (seriesDupes > 0 ? 1 : 0),
      pagesWithNear: acc.pagesWithNear + (nearDupes > 0 ? 1 : 0),
      worst: seriesDupes > acc.worst.n ? { n: seriesDupes, query: c.query } : acc.worst,
    };
  },
  Promise.resolve({
    slots: 0,
    series: 0,
    near: 0,
    pagesWithSeries: 0,
    pagesWithNear: 0,
    worst: { n: 0, query: '' },
  }),
);

const pct = (n: number, of: number) => `${((100 * n) / of).toFixed(1)}%`;

console.log(`\n${cases.length} queries · top-${LIMIT} · ${stats.slots} result slots\n`);
console.log(
  `same-series slots (title prefix ${PREFIX}): ${stats.series} (${pct(stats.series, stats.slots)}) on ${stats.pagesWithSeries} pages (${pct(stats.pagesWithSeries, cases.length)})`,
);
console.log(
  `near-duplicate slots (cosine < ${NEAR}):     ${stats.near} (${pct(stats.near, stats.slots)}) on ${stats.pagesWithNear} pages (${pct(stats.pagesWithNear, cases.length)})`,
);
if (stats.worst.n > 0) console.log(`\nworst page: ${stats.worst.n} repeats — "${stats.worst.query}"`);
