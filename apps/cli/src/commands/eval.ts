import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { semanticSearch } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { createLazyReranker } from '@memex/rerank';
import { CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';
import { EVAL_TEMPLATE, parseEvalFile, scoreCase, summarize } from '../services/eval.ts';

const DEFAULT_FILE = join(CONFIG_DIR, 'eval.json');

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

export const registerEval = (stats: Command) => {
  stats
    .command('eval')
    .description('Score retrieval against a golden-query set (hit@1, hit@5, MRR)')
    .option('--file <path>', 'Eval cases file', DEFAULT_FILE)
    .option('--limit <n>', 'Results per query', '5')
    .option('--init', 'Write a template eval file and exit')
    .option('-v, --verbose', 'Print every case, not just the summary')
    .option('--rerank', 'Rerank the candidate pool with the cross-encoder before scoring')
    .option('--sample <n>', 'Score only the first n cases (quick A/B on a slow config)')
    .action(
      async (opts: {
        file: string;
        limit: string;
        init?: boolean;
        verbose?: boolean;
        rerank?: boolean;
        sample?: string;
      }) => {
        if (opts.init) {
          if (existsSync(opts.file)) {
            console.error(pc.red(`Refusing to overwrite ${opts.file}`));
            process.exit(1);
          }
          writeFileSync(opts.file, EVAL_TEMPLATE, 'utf8');
          console.log(`${pc.green('✓')} wrote template to ${opts.file} — fill in real queries`);
          return;
        }

        if (!existsSync(opts.file)) {
          console.error(
            pc.red(`No eval file at ${opts.file}. Run \`memex stats eval --init\` to create one.`),
          );
          process.exit(1);
        }
        const allCases = parseEvalFile(readFileSync(opts.file, 'utf8'));
        const cases = opts.sample ? allCases.slice(0, Number(opts.sample)) : allCases;

        const client = openDb(CONFIG_DIR);
        guardEmbeddingModel(client);
        const embedder = await createEmbedder(MODEL_CACHE_DIR);
        const limit = Number(opts.limit);
        const reranker = opts.rerank ? createLazyReranker(MODEL_CACHE_DIR) : undefined;

        const results = [];
        for (const c of cases) {
          const got = await semanticSearch(client, embedder, c.query, limit, { reranker });
          results.push(
            scoreCase(
              c,
              got.map((n) => n.id),
            ),
          );
        }

        const s = summarize(results, limit);
        console.log();
        if (opts.verbose) {
          for (const r of s.cases) {
            const mark =
              r.rank === 1
                ? pc.green('✓1')
                : r.rank !== null
                  ? pc.yellow(`✓${r.rank}`)
                  : pc.red('✗ ');
            const got = r.rank === null ? pc.dim(` got [${r.got.join(', ')}]`) : '';
            const pos = r.pos ? pc.dim(`[${r.pos}] `) : '';
            console.log(
              `${mark} ${pos}${r.query} ${pc.dim(`(expect ${r.expect.join('|')})`)}${got}`,
            );
          }
          console.log();
        }
        console.log(
          pc.bold(
            `hit@1 ${pct(s.hitAt1)} · hit@${limit} ${pct(s.hitAtK)} · MRR ${s.mrr.toFixed(3)} · nDCG@${limit} ${s.ndcg.toFixed(3)} · recall@${limit} ${pct(s.recall)}`,
          ) + pc.dim(`  (${s.cases.length} queries)`),
        );
        for (const [pos, group] of Object.entries(s.byPosition)) {
          console.log(
            pc.dim(
              `  ${pos.padEnd(4)} n=${String(group.n).padStart(3)}  hit@1 ${pct(group.hitAt1).padStart(4)} · hit@${limit} ${pct(group.hitAtK).padStart(4)} · MRR ${group.mrr.toFixed(3)} · nDCG ${group.ndcg.toFixed(3)}`,
            ),
          );
        }
        console.log();
      },
    );
};
