import { openDb } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { prepareDrafts } from '../services/prepare-drafts.ts';

/**
 * Runs the drafting the review session would otherwise pay for at the moment
 * somebody is waiting. Meant for a scheduler overnight: `memex stats prepare`.
 *
 * It prepares and stops. Nothing here approves anything, and nothing here
 * writes a note.
 */
export const registerPrepare = (stats: Command) => {
  stats
    .command('prepare')
    .description('Draft the pending state rewrites ahead of time, so review is instant')
    .option('--limit <n>', 'How many to draft in this run', '10')
    .option('-q, --quiet', 'Print only the summary')
    .action(async (opts: { limit: string; quiet?: boolean }) => {
      const client = openDb(CONFIG_DIR);
      const limit = Math.max(1, Number(opts.limit) || 10);

      const result = await prepareDrafts(client, limit, (note) => {
        if (!opts.quiet) console.log(pc.dim(`  drafting #${note.id} ${note.title.slice(0, 60)}`));
      });

      console.log();
      console.log(pc.bold(`${result.drafted.length} drafted`), pc.dim(`(limit ${limit})`));
      if (result.swept > 0) console.log(pc.dim(`  ${result.swept} stale draft(s) cleared`));
      if (result.skipped.length > 0) console.log(pc.dim(`  ${result.skipped.length} skipped`));
      for (const failure of result.failed) {
        console.log(pc.red(`  #${failure.id} ${failure.error.slice(0, 80)}`));
      }
      console.log();

      client.sqlite.close();
    });
};
