import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { indexChunks, semanticSearch } from '@memex/core';
import { listNotes, openDb, parseTags } from '@memex/db';
import { createEmbedder, type EmbeddingModel } from '@memex/embed';
import { expandPath, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';

const usage = `Score a candidate embedding model without disturbing the live index.

  node --import tsx scripts/ab-embedding.mts --model Xenova/bge-m3 --dim 1024

Copies the DB, re-embeds every note and passage with the candidate, then runs
the golden set against the copy. The real ~/.memex/memex.db is opened read-only
for the copy and never written, so search keeps working throughout.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const spec: EmbeddingModel = {
  model: arg('--model', 'Xenova/bge-m3'),
  dtype: 'q8',
  dim: Number(arg('--dim', '1024')),
};
const LIMIT = Number(arg('--limit', '5'));
const KEEP = process.argv.includes('--keep') || process.argv.includes('--resume');
const RESUME = process.argv.includes('--resume');

const source = join(homedir(), '.memex', 'memex.db');
const workDir = join(tmpdir(), `memex-ab-${spec.model.replace(/\W+/g, '-')}-${spec.dim}`);
if (!RESUME || !existsSync(join(workDir, 'memex.db'))) {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  copyFileSync(source, join(workDir, 'memex.db'));
}

console.log(`candidate ${spec.model} (${spec.dim}d, ${spec.dtype})`);
console.log(`working copy ${workDir}\n`);

const client = openDb(workDir, spec.dim);
const embedder = await createEmbedder(MODEL_CACHE_DIR, spec);

const config = loadConfig();
const basePaths = [expandPath(config.vault_path), ...config.sources.map((s) => expandPath(s.path))];

// The indexer embeds each note under its path relative to the vault, not its
// top-level category, so the candidate has to see the same prefix or the
// comparison measures the prefix instead of the model.
const folderOf = (filePath: string): string | undefined => {
  const base = basePaths.find((p) => filePath.startsWith(p));
  const relDir = base ? relative(base, dirname(filePath)) : undefined;
  return relDir && !relDir.startsWith('..') ? relDir : undefined;
};

const alreadyEmbedded = new Set(
  RESUME
    ? (
        client.sqlite.prepare('SELECT DISTINCT note_id AS id FROM note_chunks').all() as {
          id: number;
        }[]
      ).map((r) => r.id)
    : [],
);
if (RESUME) console.log(`resuming — ${alreadyEmbedded.size} notes already embedded\n`);

const notes = listNotes(client, 100_000).filter((n) => !alreadyEmbedded.has(n.id));
const started = Date.now();
const chunks = await notes.reduce(async (pending, note, i) => {
  const done = await pending;
  // Only passages: the whole-note vector is a fallback for notes that have no
  // chunks, so it never answers here — and on a long-context model it is the
  // most expensive thing in the run, since nothing truncates it to 512 tokens.
  const count = await indexChunks(client, embedder, note.id, {
    title: note.title,
    content: note.content,
    folder: folderOf(note.filePath),
    tags: parseTags(note.tags),
  });
  if (i % 50 === 0) {
    const rate = (Date.now() - started) / 1000 / (i + 1);
    process.stdout.write(
      `\r${i + 1}/${notes.length} notes · ${done + count} chunks · eta ${(((notes.length - i) * rate) / 60).toFixed(0)}min   `,
    );
  }
  return done + count;
}, Promise.resolve(0));

console.log(`\n\nembedded ${notes.length} notes into ${chunks} chunks in ${((Date.now() - started) / 60000).toFixed(1)} min`);

type EvalCase = { query: string; expect: number[]; pos?: string };
const cases: EvalCase[] = JSON.parse(
  readFileSync(join(homedir(), '.memex', 'eval.json'), 'utf8'),
);

const queryStarted = Date.now();
const ranks = await cases.reduce(
  async (pending, c) => {
    const done = await pending;
    const hits = await semanticSearch(client, embedder, c.query, LIMIT);
    const i = hits.findIndex((h) => c.expect.includes(h.id));
    return [...done, { pos: c.pos, rank: i === -1 ? null : i + 1 }];
  },
  Promise.resolve<{ pos?: string; rank: number | null }[]>([]),
);
const perQuery = (Date.now() - queryStarted) / cases.length;

const score = (rows: typeof ranks) => ({
  n: rows.length,
  hit1: rows.filter((r) => r.rank === 1).length / rows.length,
  hit5: rows.filter((r) => r.rank !== null && r.rank <= LIMIT).length / rows.length,
  mrr: rows.reduce((acc, r) => acc + (r.rank === null ? 0 : 1 / r.rank), 0) / rows.length,
});

const pct = (x: number) => `${Math.round(x * 100)}%`;
const line = (label: string, s: ReturnType<typeof score>) =>
  `${label.padEnd(6)} n=${String(s.n).padStart(3)}  hit@1 ${pct(s.hit1).padStart(4)} · hit@${LIMIT} ${pct(s.hit5).padStart(4)} · MRR ${s.mrr.toFixed(3)}`;

console.log(`\n${line('all', score(ranks))}`);
for (const pos of ['head', 'mid', 'tail']) {
  const rows = ranks.filter((r) => r.pos === pos);
  if (rows.length > 0) console.log(line(pos, score(rows)));
}
console.log(`\nsearch latency ${perQuery.toFixed(0)}ms/query (embedding + retrieval)`);

client.sqlite.close();
if (!KEEP) rmSync(workDir, { recursive: true, force: true });
else console.log(`\nkept working copy at ${workDir}`);
