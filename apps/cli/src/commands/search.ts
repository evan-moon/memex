import type { Command } from 'commander';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { createReranker, type Reranker } from '@memex/rerank';
import { loadConfig, CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';
import { semanticSearch } from '../services/note.ts';
import { layerBadge } from '../layer.ts';

export const registerSearch = (program: Command) => {
  program
    .command('search <query>')
    .description('Semantically search the second brain')
    .option('-l, --limit <n>', 'Max results', '5')
    .option('-c, --category <category>', 'Filter by top-level folder (e.g. conversations)')
    .option('-t, --tag <tag>', 'Filter by tag (e.g. typescript)')
    .option('--from <date>', 'Filter notes created on or after date (YYYY-MM-DD)')
    .option('--to <date>', 'Filter notes created on or before date (YYYY-MM-DD)')
    .action(async (query: string, opts: { limit: string; category?: string; tag?: string; from?: string; to?: string }) => {
      const s = spinner();
      s.start('Loading embedder...');

      const config = loadConfig();
      const client = openDb(CONFIG_DIR);
      const embedder = await createEmbedder(MODEL_CACHE_DIR);

      const rerankEnabled = process.env.MEMEX_RERANK !== '0';
      const reranker: Reranker | null = rerankEnabled
        ? await createReranker(MODEL_CACHE_DIR)
        : null;

      s.message('Searching...');
      const parseDate = (s: string, label: string): number => {
        const ms = new Date(s).getTime();
        if (isNaN(ms)) {
          console.error(`Error: Invalid ${label} date: "${s}". Use YYYY-MM-DD format.`);
          process.exit(1);
        }
        return ms;
      };
      const dateFrom = opts.from ? parseDate(opts.from, '--from') : undefined;
      const dateTo = opts.to
        ? parseDate(opts.to.includes('T') ? opts.to : opts.to + 'T23:59:59.999Z', '--to')
        : undefined;
      const results = await semanticSearch(
        client,
        embedder,
        reranker,
        query,
        Number(opts.limit),
        opts.category,
        opts.tag,
        dateFrom,
        dateTo,
      );
      s.stop(`Found ${results.length} result(s)`);

      if (results.length === 0) {
        console.log(pc.dim('No notes found.'));
        return;
      }

      for (const note of results) {
        console.log();
        console.log(`${pc.bold(`[${note.id}]`)} ${layerBadge(note.layer)} ${pc.bold(note.title)}`);
        const preview = note.content.slice(0, 200).replace(/\n/g, ' ');
        console.log(pc.dim(preview + (note.content.length > 200 ? '…' : '')));
      }
    });
};
