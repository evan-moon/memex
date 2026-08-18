import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const usage = `Score memex against Obsidian on the same queries.

  node --import tsx docs/eval/obsidian/score.mts

Same queries answered by both tools, so the comparison is paired: what matters
is the per-query difference, not two averages that could differ because one
tool got easier queries. Reports a bootstrap CI on the mean MRR difference and
a sign test on how many queries each tool won, and refuses to call a winner
when the interval contains zero.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const here = dirname(new URL(import.meta.url).pathname);
type Golden = { index: number; query: string; expect: number[]; pos: string | null; source: string };

const golden = JSON.parse(readFileSync(join(here, 'golden-set.json'), 'utf8')) as Golden[];
const memex = JSON.parse(readFileSync(join(here, 'memex.json'), 'utf8')) as {
  index: number;
  ranked: number[];
}[];

// Hand-edited in a spreadsheet, so quoted commas in the query column are real.
const parseRow = (line: string): string[] => {
  const { cells, field } = [...line].reduce<{
    cells: string[];
    field: string;
    quoted: boolean;
    pendingQuote: boolean;
  }>(
    (acc, ch) => {
      if (acc.pendingQuote) {
        if (ch === '"') return { ...acc, field: acc.field + '"', pendingQuote: false };
        if (ch === ',') return { cells: [...acc.cells, acc.field], field: '', quoted: false, pendingQuote: false };
        return { ...acc, quoted: false, pendingQuote: false };
      }
      if (acc.quoted) {
        return ch === '"' ? { ...acc, pendingQuote: true } : { ...acc, field: acc.field + ch };
      }
      if (ch === '"' && acc.field.length === 0) return { ...acc, quoted: true };
      if (ch === ',') return { cells: [...acc.cells, acc.field], field: '', quoted: false, pendingQuote: false };
      return { ...acc, field: acc.field + ch };
    },
    { cells: [], field: '', quoted: false, pendingQuote: false },
  );
  return [...cells, field];
};

const obsidian = readFileSync(join(here, 'obsidian.csv'), 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter((line) => line.trim().length > 0)
  .map((line) => {
    const cells = parseRow(line);
    return {
      index: Number(cells[0]),
      // An empty cell is "not recorded"; a literal 0 is "Obsidian returned
      // nothing here". Parsing both to 0 would make a blank template look like
      // a clean sweep, which is exactly the number nobody should publish.
      ranked: cells
        .slice(2, 12)
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    };
  });

const rankOf = (ranked: number[], expect: number[]): number | null => {
  const i = ranked.findIndex((id) => expect.includes(id));
  return i === -1 ? null : i + 1;
};

const mrr = (rank: number | null) => (rank === null ? 0 : 1 / rank);
const ndcg = (rank: number | null) => (rank === null ? 0 : 1 / Math.log2(rank + 1));
const hit = (rank: number | null, k: number) => (rank !== null && rank <= k ? 1 : 0);

const paired = golden.map((g) => {
  const m = memex.find((r) => r.index === g.index)?.ranked ?? [];
  const o = obsidian.find((r) => r.index === g.index)?.ranked ?? [];
  return { ...g, memexRank: rankOf(m, g.expect), obsidianRank: rankOf(o, g.expect) };
});

// A blank row is not "Obsidian found nothing", it is "nobody looked yet" — and
// scoring it as a miss hands memex a clean sweep that means nothing.
const unfilled = golden.filter(
  (g) => (obsidian.find((r) => r.index === g.index)?.ranked.length ?? 0) === 0,
);
if (unfilled.length > 0) {
  console.error(
    `obsidian.csv has ${unfilled.length}/${golden.length} rows with no results recorded.`,
  );
  console.error(`Fill them in first — queries ${unfilled.map((g) => g.index).join(', ')}`);
  console.error(`A query where Obsidian genuinely returns nothing: write 0 in rank1.`);
  process.exit(1);
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const pct = (x: number) => `${Math.round(x * 100)}%`;

const summarize = (rows: typeof paired, pick: (r: (typeof paired)[number]) => number | null) => ({
  n: rows.length,
  hit1: mean(rows.map((r) => hit(pick(r), 1))),
  hit5: mean(rows.map((r) => hit(pick(r), 5))),
  hit10: mean(rows.map((r) => hit(pick(r), 10))),
  mrr: mean(rows.map((r) => mrr(pick(r)))),
  ndcg: mean(rows.map((r) => ndcg(pick(r)))),
});

const line = (label: string, s: ReturnType<typeof summarize>) =>
  `${label.padEnd(9)} hit@1 ${pct(s.hit1).padStart(4)} · hit@5 ${pct(s.hit5).padStart(4)} · hit@10 ${pct(s.hit10).padStart(4)} · MRR ${s.mrr.toFixed(3)} · nDCG ${s.ndcg.toFixed(3)}`;

// Seeded so the published interval is reproducible.
const mulberry32 = (seed: number) => () => {
  const t = (seed += 0x6d2b79f5);
  const x = Math.imul(t ^ (t >>> 15), 1 | t);
  const y = x + Math.imul(x ^ (x >>> 7), 61 | x);
  return ((y ^ (y >>> 14)) >>> 0) / 4294967296;
};

const diffs = paired.map((p) => mrr(p.memexRank) - mrr(p.obsidianRank));
const rand = mulberry32(42);
const boots = Array.from({ length: 10_000 }, () =>
  mean(Array.from({ length: diffs.length }, () => diffs[Math.floor(rand() * diffs.length)])),
).sort((a, b) => a - b);
const lo = boots[Math.floor(boots.length * 0.025)];
const hi = boots[Math.floor(boots.length * 0.975)];

const wins = diffs.filter((d) => d > 0).length;
const losses = diffs.filter((d) => d < 0).length;
const ties = diffs.length - wins - losses;

const choose = (n: number, k: number): number =>
  k === 0 || k === n ? 1 : Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1);
const decided = wins + losses;
const signP =
  decided === 0
    ? 1
    : Math.min(
        1,
        2 *
          Array.from({ length: decided + 1 }, (_, i) => i)
            .filter((i) => i >= Math.max(wins, losses))
            .reduce((acc, i) => acc + choose(decided, i) * 0.5 ** decided, 0),
      );

console.log();
console.log(line('memex', summarize(paired, (r) => r.memexRank)));
console.log(line('obsidian', summarize(paired, (r) => r.obsidianRank)));
console.log();
for (const source of ['notes', 'blog']) {
  const rows = paired.filter((p) => p.source === source);
  if (rows.length === 0) continue;
  console.log(line(`  ${source} m`, summarize(rows, (r) => r.memexRank)));
  console.log(line(`  ${source} o`, summarize(rows, (r) => r.obsidianRank)));
}
console.log();
console.log(`mean MRR difference (memex − obsidian): ${mean(diffs).toFixed(3)}`);
console.log(`bootstrap 95% CI: [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
console.log(`per-query: memex ${wins} wins · obsidian ${losses} wins · ${ties} ties (sign test p=${signP.toFixed(3)})`);
console.log();
console.log(
  lo > 0
    ? 'verdict: memex ahead — interval excludes zero'
    : hi < 0
      ? 'verdict: obsidian ahead — interval excludes zero'
      : 'verdict: no difference this sample can resolve — interval contains zero',
);
