import { spinner } from '@clack/prompts';
import { openDb, resyncNoteFacets } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { CONFIG_DIR, expandPath, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';
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
        guardEmbeddingModel(client);
        const embedder = await createEmbedder(MODEL_CACHE_DIR);

        const dirs = [vaultPath, ...config.sources.map((src) => src.path)];
        const total = { added: 0, updated: 0, removed: 0, skipped: 0, relinked: 0, reindexed: 0 };

        for (const dir of dirs) {
          s.message(`Indexing ${dir}...`);
          const stats = await indexDirectory(
            client,
            embedder,
            dir,
            (file) => {
              s.message(`Indexing ${file.split('/').slice(-2).join('/')}`);
            },
            force,
          );
          total.added += stats.added;
          total.updated += stats.updated;
          total.removed += stats.removed;
          total.skipped += stats.skipped;
          total.relinked += stats.relinked;
          total.reindexed += stats.reindexed;
        }

        resyncNoteFacets(client, vaultPath);

        const parts = [
          total.added > 0 && pc.green(`+${total.added} added`),
          total.updated > 0 && pc.yellow(`~${total.updated} updated`),
          total.removed > 0 && pc.red(`-${total.removed} removed`),
          total.skipped > 0 && pc.dim(`${total.skipped} unchanged`),
          total.relinked !== 0 &&
            pc.cyan(`${total.relinked > 0 ? '+' : ''}${total.relinked} links`),
          total.reindexed > 0 && pc.cyan(`${total.reindexed} reindexed`),
        ].filter(Boolean);

        s.stop(parts.length > 0 ? parts.join('  ') : 'Nothing to update');
      } catch (err) {
        s.stop('Failed');
        console.error(err);
        process.exit(1);
      }
    });
};
