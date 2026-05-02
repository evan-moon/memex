import type { Command } from 'commander';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { loadConfig, CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';
import { semanticSearch } from '../services/note.ts';

export const registerSearch = (program: Command) => {
  program
    .command('search <query>')
    .description('Semantically search the second brain')
    .option('-l, --limit <n>', 'Max results', '5')
    .option('-c, --category <category>', 'Filter by top-level folder (e.g. conversations)')
    .option('-t, --tag <tag>', 'Filter by tag (e.g. typescript)')
    .action(async (query: string, opts: { limit: string; category?: string; tag?: string }) => {
      const s = spinner();
      s.start('Loading embedder...');

      const config = loadConfig();
      const client = openDb(CONFIG_DIR);
      const embedder = await createEmbedder(MODEL_CACHE_DIR);

      s.message('Searching...');
      const results = await semanticSearch(client, embedder, query, Number(opts.limit), opts.category, opts.tag);
      s.stop(`Found ${results.length} result(s)`);

      if (results.length === 0) {
        console.log(pc.dim('No notes found.'));
        return;
      }

      for (const note of results) {
        console.log();
        console.log(pc.bold(`[${note.id}] ${note.title}`));
        const preview = note.content.slice(0, 200).replace(/\n/g, ' ');
        console.log(pc.dim(preview + (note.content.length > 200 ? '…' : '')));
      }
    });
};
