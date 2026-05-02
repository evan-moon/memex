import type { Command } from 'commander';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { loadConfig, expandPath, CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';
import { indexDirectory } from '../services/indexer.ts';

export const registerIndex = (program: Command) => {
  program
    .command('index')
    .description('Scan vault and all sources, index new or changed notes')
    .option('-f, --force', 'Re-index all files regardless of modification time')
    .action(async ({ force }: { force?: boolean }) => {
      const s = spinner();
      s.start('Loading embedder...');

      try {
        const config = loadConfig();
        const vaultPath = expandPath(config.vault_path);
        const client = openDb(CONFIG_DIR);
        const embedder = await createEmbedder(MODEL_CACHE_DIR);

        const dirs = [vaultPath, ...config.sources.map((src) => src.path)];
        let total = { added: 0, updated: 0, removed: 0, skipped: 0 };

        for (const dir of dirs) {
          s.message(`Indexing ${dir}...`);
          const stats = await indexDirectory(client, embedder, dir, (file) => {
            s.message(`Indexing ${file.split('/').slice(-2).join('/')}`);
          }, force);
          total.added += stats.added;
          total.updated += stats.updated;
          total.removed += stats.removed;
          total.skipped += stats.skipped;
        }

        const parts = [
          total.added > 0 && pc.green(`+${total.added} added`),
          total.updated > 0 && pc.yellow(`~${total.updated} updated`),
          total.removed > 0 && pc.red(`-${total.removed} removed`),
          total.skipped > 0 && pc.dim(`${total.skipped} unchanged`),
        ].filter(Boolean);

        s.stop(parts.length > 0 ? parts.join('  ') : 'Nothing to update');
      } catch (err) {
        s.stop('Failed');
        console.error(err);
        process.exit(1);
      }
    });
};
