import { openDb } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { isProviderId } from '../services/llm.ts';
import { prepareDrafts } from '../services/prepare-drafts.ts';

/**
 * Drafts the pending rewrites now, so a review session does not stop for a
 * model call after every press.
 *
 * Deliberately not something a schedule runs. A laptop is not a server, and a
 * cron that assumes it is spends the model on nights the machine happens to be
 * awake and on work nobody asked for. The person asks; this answers.
 *
 * It prepares and stops. Nothing here approves anything, and nothing here
 * writes a note.
 */
export const registerPrepare = (stats: Command) => {
  stats
    .command('prepare')
    .description('Draft the pending state rewrites now, so a review session does not wait')
    .option('--limit <n>', 'How many to draft in this run', '10')
    .option('--provider <id>', 'claude-code or codex', 'claude-code')
    .option('--model <name>', 'Model to draft with')
    .option('-q, --quiet', 'Print only the summary')
    .action(async (opts: { limit: string; provider: string; model?: string; quiet?: boolean }) => {
      const client = openDb(CONFIG_DIR);
      const limit = Math.max(1, Number(opts.limit) || 10);
      if (!isProviderId(opts.provider)) {
        console.error(pc.red(`Unknown provider "${opts.provider}".`));
        process.exitCode = 1;
        return;
      }

      const choice = opts.model ? { provider: opts.provider, model: opts.model } : undefined;

      const result = await prepareDrafts(client, limit, {
        choice,
        onStep: (note) => {
          if (!opts.quiet) console.log(pc.dim(`  drafting #${note.id} ${note.title.slice(0, 60)}`));
        },
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
