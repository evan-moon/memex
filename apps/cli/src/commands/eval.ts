import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { semanticSearch } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
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
    .action(async (opts: { file: string; limit: string; init?: boolean }) => {
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
      const cases = parseEvalFile(readFileSync(opts.file, 'utf8'));

      const client = openDb(CONFIG_DIR);
      guardEmbeddingModel(client);
      const embedder = await createEmbedder(MODEL_CACHE_DIR);
      const limit = Number(opts.limit);

      const results = [];
      for (const c of cases) {
        const got = await semanticSearch(client, embedder, c.query, limit);
        results.push(
          scoreCase(
            c,
            got.map((n) => n.id),
          ),
        );
      }

      const s = summarize(results);
      console.log();
      for (const r of s.cases) {
        const mark =
          r.rank === 1 ? pc.green('✓1') : r.rank !== null ? pc.yellow(`✓${r.rank}`) : pc.red('✗ ');
        const got = r.rank === null ? pc.dim(` got [${r.got.join(', ')}]`) : '';
        console.log(`${mark} ${r.query} ${pc.dim(`(expect ${r.expect.join('|')})`)}${got}`);
      }
      console.log();
      console.log(
        pc.bold(
          `hit@1 ${pct(s.hitAt1)} · hit@${limit} ${pct(s.hitAt5)} · MRR ${s.mrr.toFixed(3)}`,
        ) + pc.dim(`  (${s.cases.length} queries)`),
      );
      console.log();
    });
};
