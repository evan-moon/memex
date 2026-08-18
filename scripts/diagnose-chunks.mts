import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { semanticSearch } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';

const usage = `Ask where the chunk signal is lost.

  node --import tsx scripts/diagnose-chunks.mts [--pos tail] [--limit 60]

For each golden case it reports two ranks for the expected note:
  chunk  — rank of its best chunk in the raw chunk-vector KNN (fusion not involved)
  final  — rank of the note in the fused result list

A good chunk rank with a bad final rank means fusion is throwing the signal
away. A bad chunk rank means the passage embedding never found it at all.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const POS = arg('--pos', 'tail');
const LIMIT = Number(arg('--limit', '60'));
const KNN = Number(arg('--knn', '400'));

type EvalCase = { query: string; expect: number[]; pos?: string };

const cases: EvalCase[] = JSON.parse(
  readFileSync(join(homedir(), '.memex', 'eval.json'), 'utf8'),
).filter((c: EvalCase) => (POS === 'all' ? true : c.pos === POS));

const client = openDb(CONFIG_DIR);
const embedder = await createEmbedder(MODEL_CACHE_DIR);

const chunkRankQuery = client.sqlite.prepare(
  `SELECT c.note_id AS noteId, e.distance
   FROM note_chunk_embeddings e
   JOIN note_chunks c ON c.id = e.chunk_id
   WHERE e.embedding MATCH ? AND k = ?
   ORDER BY e.distance`,
);

const noteRankQuery = client.sqlite.prepare(
  `SELECT n.id AS noteId, e.distance
   FROM note_embeddings e
   JOIN notes n ON n.id = e.note_id
   WHERE e.embedding MATCH ? AND k = ?
   ORDER BY e.distance`,
);

const rankOf = (rows: { noteId: number }[], target: number): number | null => {
  const seen: number[] = [];
  for (const row of rows) {
    if (!seen.includes(row.noteId)) seen.push(row.noteId);
    if (row.noteId === target) return seen.length;
  }
  return null;
};

const sample = cases.slice(0, LIMIT);
const rows = await sample.reduce(
  async (pending, c) => {
    const done = await pending;
    const embedding = await embedder(c.query, 'query');
    const buf = Buffer.from(new Float32Array(embedding).buffer);
    const chunkRows = chunkRankQuery.all(buf, KNN) as { noteId: number }[];
    const noteRows = noteRankQuery.all(buf, KNN) as { noteId: number }[];
    const final = await semanticSearch(client, embedder, c.query, 20);
    const gold = c.expect[0];
    return [
      ...done,
      {
        query: c.query,
        gold,
        chunk: rankOf(chunkRows, gold),
        note: rankOf(noteRows, gold),
        final: final.findIndex((r) => r.id === gold) + 1 || null,
      },
    ];
  },
  Promise.resolve<{ query: string; gold: number; chunk: number | null; note: number | null; final: number | null }[]>([]),
);

const pct = (n: number) => `${Math.round((100 * n) / rows.length)}%`;
const chunkTop5 = rows.filter((r) => r.chunk !== null && r.chunk <= 5);
const noteTop5 = rows.filter((r) => r.note !== null && r.note <= 5);
const lost = rows.filter((r) => r.chunk !== null && r.chunk <= 5 && (r.final === null || r.final > 5));
const rescued = rows.filter((r) => (r.note === null || r.note > 5) && r.chunk !== null && r.chunk <= 5);

console.log(`\n${POS} cases: ${rows.length} (chunk KNN k=${KNN})\n`);
console.log(`gold in chunk-arm top5:  ${chunkTop5.length} (${pct(chunkTop5.length)})`);
console.log(`gold in note-arm top5:   ${noteTop5.length} (${pct(noteTop5.length)})`);
console.log(`chunk found it, fusion lost it: ${lost.length} (${pct(lost.length)})`);
console.log(`only the chunk arm could find it: ${rescued.length} (${pct(rescued.length)})`);
const bucket = (max: number) => rows.filter((r) => r.chunk !== null && r.chunk <= max).length;
console.log(
  `\nchunk-arm recall of gold note: top5 ${pct(bucket(5))} · top10 ${pct(bucket(10))} · top20 ${pct(bucket(20))} · top50 ${pct(bucket(50))} · top100 ${pct(bucket(100))}`,
);
console.log(`(the gap between top5 and top50 is the reranker's headroom)`);

console.log(`\nworst fusion losses:`);
for (const r of lost.slice(0, 12)) {
  console.log(`  chunk#${String(r.chunk).padStart(3)} note#${String(r.note ?? '-').padStart(4)} final#${String(r.final ?? '-').padStart(3)}  ${r.query.slice(0, 60)}`);
}
