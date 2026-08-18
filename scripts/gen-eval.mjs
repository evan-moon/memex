#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';

const usage = `Grow the retrieval golden set by asking Claude what each note uniquely answers.

  node scripts/gen-eval.mjs [--limit 150] [--model sonnet] [--concurrency 4] [--apply]

Samples notes stratified by category, length and recency, then asks headless
Claude for queries that only that note answers. Two properties make the output
a usable yardstick rather than a string-matching test:

  - queries may not reuse distinctive title words, so the title arm cannot win
    them for free
  - each query is labelled head / mid / tail by where in the note its answer
    lives, so truncated-embedding blind spots show up as a position split

Runs as a dry run unless --apply. Existing cases are kept; queries already in
the file are skipped, so re-running only adds.`;

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const DB = arg('--db', join(homedir(), '.memex', 'memex.db'));
const OUT = arg('--out', join(homedir(), '.memex', 'eval.json'));
const LIMIT = Number(arg('--limit', '150'));
const MODEL = arg('--model', 'sonnet');
const CONCURRENCY = Number(arg('--concurrency', '4'));
const RECENT_FROM = Date.parse(arg('--recent-from', '2026-06-15'));
const MIN_CHARS = Number(arg('--min-chars', '400'));
const APPLY = process.argv.includes('--apply');

const execFileAsync = promisify(execFile);

const mulberry32 = (seed) => () => {
  const t = (seed += 0x6d2b79f5);
  const x = Math.imul(t ^ (t >>> 15), 1 | t);
  const y = x + Math.imul(x ^ (x >>> 7), 61 | x);
  return ((y ^ (y >>> 14)) >>> 0) / 4294967296;
};

const shuffled = (items, rand) =>
  items
    .map((item) => [rand(), item])
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);

const lengthBucket = (chars) => (chars < 1200 ? 'short' : chars < 3500 ? 'mid' : 'long');

const stratify = (notes, limit, rand) => {
  const groups = notes.reduce((acc, note) => {
    const key = `${note.category ?? 'root'}|${lengthBucket(note.content.length)}|${
      (note.authored_at ?? note.created_at) >= RECENT_FROM ? 'recent' : 'old'
    }`;
    return { ...acc, [key]: [...(acc[key] ?? []), note] };
  }, {});
  const queues = Object.values(groups).map((group) => shuffled(group, rand));
  const picked = [];
  const drain = () => {
    const before = picked.length;
    for (const queue of queues) {
      if (picked.length >= limit) return;
      const next = queue.shift();
      if (next) picked.push(next);
    }
    if (picked.length > before && picked.length < limit) drain();
  };
  drain();
  return picked;
};

const slice = (body) => {
  if (body.length <= 12000) return body;
  const third = 4000;
  const mid = Math.floor(body.length / 2);
  return [
    body.slice(0, third),
    '\n\n[…]\n\n',
    body.slice(mid - third / 2, mid + third / 2),
    '\n\n[…]\n\n',
    body.slice(-third),
  ].join('');
};

const buildPrompt = (note) => `You are building a retrieval benchmark for a personal second brain.
Its owner writes mostly in Korean and searches it in the same voice.

Below is ONE note. Write 3 search queries that this note — and only this note — answers.

Hard rules:
- Write each query the way the owner would actually type it: Korean unless the note is English.
- NEVER reuse a distinctive word from the note's title. Paraphrase the concept. A query sharing a rare title word tests string matching, not retrieval.
- No dates, no note ids, no meta words ("노트", "글", "기록").
- Ask about substance — a decision, a number, a cause, a rejected option, someone's opinion.
- Vary shape: one query of 2–5 keywords, the others as natural questions.

Position coverage — this is the point of the benchmark:
- one query whose answer is in the OPENING of the note → "head"
- one whose answer sits in the MIDDLE → "mid"
- one whose answer is near the END → "tail"
If the note is too short to have a real middle or end, label those "head" too.

Output strict JSON, nothing else:
{"queries":[{"q":"...","pos":"head"},{"q":"...","pos":"mid"},{"q":"...","pos":"tail"}]}

TITLE: ${note.title}
FOLDER: ${note.category ?? '(root)'}
TAGS: ${note.tags ?? '[]'}

BODY:
${slice(note.content)}`;

const parseQueries = (raw) => {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  const data = JSON.parse(match[0]);
  if (!Array.isArray(data.queries)) return [];
  return data.queries
    .filter((entry) => typeof entry?.q === 'string' && entry.q.trim().length > 0)
    .map((entry) => ({
      q: entry.q.trim(),
      pos: ['head', 'mid', 'tail'].includes(entry.pos) ? entry.pos : 'head',
    }));
};

const titleTokens = (title) =>
  new Set(
    title
      .toLowerCase()
      .replace(/[[\]()—·,.:|]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );

const leaksTitle = (query, title) => {
  const tokens = titleTokens(title);
  if (tokens.size === 0) return false;
  const lowered = query.toLowerCase();
  return [...tokens].some((token) => lowered.includes(token));
};

const askClaude = async (note) => {
  const { stdout } = await execFileAsync(
    'claude',
    [
      '-p',
      buildPrompt(note),
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
  const envelope = JSON.parse(stdout);
  if (envelope.is_error) throw new Error(envelope.result ?? 'claude reported an error');
  return { queries: parseQueries(envelope.result), cost: envelope.total_cost_usd ?? 0 };
};

const runPool = async (items, worker, size) => {
  const results = [];
  const queue = [...items.entries()];
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [index, item] = next;
      results[index] = await worker(item, index);
    }
  });
  await Promise.all(runners);
  return results;
};

const db = new Database(DB, { readonly: true });
const candidates = db
  .prepare(
    `SELECT id, title, content, category, tags, created_at, authored_at
     FROM notes
     WHERE length(content) >= ? AND layer != 'rule'
     ORDER BY id`,
  )
  .all(MIN_CHARS);

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const seenQueries = new Set(existing.map((c) => c.query));
const seenNotes = new Set(existing.flatMap((c) => c.expect));

const pool = candidates.filter((note) => !seenNotes.has(note.id));
const sample = stratify(pool, LIMIT, mulberry32(Number(arg('--seed', '42'))));

console.log(
  `${candidates.length} eligible notes · ${existing.length} existing cases · sampling ${sample.length}`,
);
console.log(`model ${MODEL} · concurrency ${CONCURRENCY} · ${APPLY ? 'APPLY' : 'dry run'}\n`);

let done = 0;
let spent = 0;
let dropped = 0;
const generated = await runPool(
  sample,
  async (note) => {
    try {
      const { queries, cost } = await askClaude(note);
      spent += cost;
      const kept = queries.filter((entry) => {
        if (leaksTitle(entry.q, note.title)) {
          dropped += 1;
          return false;
        }
        return true;
      });
      done += 1;
      process.stdout.write(
        `\r${done}/${sample.length} notes · ${dropped} title-leaks dropped · $${spent.toFixed(2)}`,
      );
      return kept.map((entry) => ({ query: entry.q, expect: [note.id], pos: entry.pos }));
    } catch (error) {
      done += 1;
      process.stderr.write(`\n#${note.id} failed: ${error.message}\n`);
      return [];
    }
  },
  CONCURRENCY,
);

const fresh = generated.flat().filter((c) => !seenQueries.has(c.query));
const merged = [...existing, ...fresh];

console.log(`\n\n+${fresh.length} cases → ${merged.length} total`);
const byPos = fresh.reduce((acc, c) => ({ ...acc, [c.pos]: (acc[c.pos] ?? 0) + 1 }), {});
console.log(`position split: ${JSON.stringify(byPos)}`);
console.log(`\nsample:`);
for (const c of fresh.slice(0, 8)) console.log(`  [${c.pos}] ${c.query} → #${c.expect[0]}`);

if (!APPLY) {
  console.log(`\n(dry run — pass --apply to write ${OUT})`);
  process.exit(0);
}

writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(`\n✓ wrote ${OUT}`);
