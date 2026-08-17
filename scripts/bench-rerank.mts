import { homedir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '@memex/db';
import { createReranker } from '@memex/rerank';

const usage = `Time the cross-encoder at the pool sizes search would use.

  node --import tsx scripts/bench-rerank.mts

Reranking only pays for itself if a query still feels instant, so this reports
milliseconds per query at each candidate-pool size, using real note passages.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const client = openDb(join(homedir(), '.memex'));
const rows = client.sqlite
  .prepare('SELECT excerpt FROM note_chunks ORDER BY id LIMIT 50')
  .all() as { excerpt: string }[];
const passages = rows.map((r) => r.excerpt.slice(0, 1200));

const rerank = await createReranker(join(homedir(), '.memex', 'models'));

await rerank('warmup', passages.slice(0, 2));

const query = '이직할 때 회사를 고르는 기준으로 연봉보다 중요하게 생각하는 게 뭐였지';
for (const size of [5, 10, 20, 30, 50]) {
  const started = process.hrtime.bigint();
  await rerank(query, passages.slice(0, size));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`pool ${String(size).padStart(2)}: ${ms.toFixed(0)}ms  (${(ms / size).toFixed(0)}ms per passage)`);
}
