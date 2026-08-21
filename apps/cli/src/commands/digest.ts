import { openDb } from '@memex/db';
import { CONFIG_DIR, formatDate } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { buildDigest } from '../services/digest.ts';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';

export const registerDigest = (program: Command) => {
  program
    .command('digest')
    .description('Summarize notes saved in the last N days, grouped by folder')
    .option('-d, --days <n>', 'Number of days to look back', '7')
    .action((opts: { days: string }) => {
      const days = Number(opts.days);
      if (Number.isNaN(days) || days <= 0) {
        console.error(pc.red('Error: --days must be a positive number'));
        process.exit(1);
      }

      const client = openDb(CONFIG_DIR);
      guardEmbeddingModel(client);
      const digest = buildDigest(client, { days });
      const sinceDate = formatDate(new Date(digest.since));

      if (digest.total === 0) {
        console.log(pc.dim(`No notes saved in the last ${days} day(s) (since ${sinceDate}).`));
        return;
      }

      console.log();
      console.log(pc.bold(`Digest — last ${days} day(s) since ${sinceDate}`));
      console.log(pc.dim(`${digest.total} note(s) across ${digest.folders.length} folder(s)`));

      digest.folders.forEach(({ folder, notes }) => {
        console.log();
        console.log(pc.bold(pc.cyan(folder)));
        notes.forEach((note) => {
          const tags = note.tags.length > 0 ? pc.dim(`  [${note.tags.join(', ')}]`) : '';
          console.log(
            `  ${pc.bold(`#${note.id}`)} ${note.title}${tags}  ${pc.dim(formatDate(new Date(note.at)))}`,
          );
        });
      });

      if (digest.signals.length > 0) {
        const summary = digest.signals.map((s) => `${s.count} ${s.type}`).join(', ');
        console.log();
        console.log(pc.bold(pc.magenta('Signals (new)')));
        console.log(pc.dim(`  ${summary} — review: memex signals`));
      }

      const { active, stale } = digest.inferences;
      if (active.length > 0 || stale.length > 0) {
        console.log();
        console.log(pc.bold(pc.green('Inferences')));
        for (const inf of stale) console.log(`  ${pc.red('[!] STALE')} #${inf.id} ${inf.title}`);
        for (const inf of active) console.log(`  ${pc.dim('·')} #${inf.id} ${inf.title}`);
      }

      if (digest.connection) {
        const { from, to, daysApart } = digest.connection;
        console.log();
        console.log(pc.bold(pc.blue('Connection')));
        console.log(`  ${pc.bold(`#${from.id}`)} ${from.title}`);
        console.log(
          `  ${pc.dim(`↕ ${daysApart} days apart`)}\n  ${pc.bold(`#${to.id}`)} ${to.title}`,
        );
      }

      console.log();
    });
};
