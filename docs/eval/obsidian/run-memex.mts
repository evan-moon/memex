import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { semanticSearch } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';

const usage = `Collect memex's top 10 for every golden query.

  node --import tsx docs/eval/obsidian/run-memex.mts

Runs against the live index, which covers exactly the notes build-vault.mts
wrote out, so both tools answer over the same corpus. Series collapse is off
here: Smart Connections has no equivalent, and leaving it on would score a
deliberate diversity trade as a retrieval difference.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const here = dirname(new URL(import.meta.url).pathname);
const golden = JSON.parse(readFileSync(join(here, 'golden-set.json'), 'utf8')) as {
  index: number;
  query: string;
}[];

const client = openDb(CONFIG_DIR);
const embedder = await createEmbedder(MODEL_CACHE_DIR);

const rows = await golden.reduce(
  async (pending, g) => {
    const done = await pending;
    const hits = await semanticSearch(client, embedder, g.query, 10, { seriesCap: 0 });
    process.stdout.write(`\r${done.length + 1}/${golden.length}`);
    return [...done, { index: g.index, query: g.query, ranked: hits.map((h) => h.id) }];
  },
  Promise.resolve<{ index: number; query: string; ranked: number[] }[]>([]),
);

writeFileSync(join(here, 'memex.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

// Never overwrite results that are already in: re-running this to refresh the
// memex side after the corpus changed should not wipe the Obsidian side, which
// costs a run of the collector to reproduce.
const csvPath = join(here, 'obsidian.csv');
const hadResults = existsSync(csvPath);
if (!hadResults) {
  const header = 'index,query,rank1,rank2,rank3,rank4,rank5,rank6,rank7,rank8,rank9,rank10';
  const csv = golden.map((g) => `${g.index},"${g.query.replace(/"/g, '""')}",,,,,,,,,,`).join('\n');
  writeFileSync(csvPath, `${header}\n${csv}\n`, 'utf8');
}

console.log(
  `\nwrote memex.json (${rows.length} queries)${hadResults ? ' — left obsidian.csv alone' : ' and a blank obsidian.csv to fill in'}`,
);
