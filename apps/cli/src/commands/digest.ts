import type { Command } from 'commander';
import pc from 'picocolors';
import { openDb, listNotesSince, parseTags } from '@memex/db';
import { CONFIG_DIR, formatDate } from '@memex/utils';

export const registerDigest = (program: Command) => {
  program
    .command('digest')
    .description('Summarize notes saved in the last N days, grouped by folder')
    .option('-d, --days <n>', 'Number of days to look back', '7')
    .action((opts: { days: string }) => {
      const days = Number(opts.days);
      if (isNaN(days) || days <= 0) {
        console.error(pc.red('Error: --days must be a positive number'));
        process.exit(1);
      }

      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const sinceDate = formatDate(new Date(sinceMs));

      const client = openDb(CONFIG_DIR);
      const notesResult = listNotesSince(client, sinceMs);

      if (notesResult.length === 0) {
        console.log(pc.dim(`No notes saved in the last ${days} day(s) (since ${sinceDate}).`));
        return;
      }

      // Group by category (top-level folder), null → '(root)'
      const groups = new Map<string, typeof notesResult>();
      for (const note of notesResult) {
        const key = note.category ?? '(root)';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(note);
      }

      console.log();
      console.log(pc.bold(`Digest — last ${days} day(s) since ${sinceDate}`));
      console.log(pc.dim(`${notesResult.length} note(s) across ${groups.size} folder(s)`));

      for (const [folder, folderNotes] of groups) {
        console.log();
        console.log(pc.bold(pc.cyan(`${folder}`)));
        for (const note of folderNotes) {
          const date = formatDate(new Date(note.createdAt));
          const tags = parseTags(note.tags);
          const tagStr = tags.length > 0 ? pc.dim(`  [${tags.join(', ')}]`) : '';
          console.log(`  ${pc.bold(`#${note.id}`)} ${note.title}${tagStr}  ${pc.dim(date)}`);
        }
      }
      console.log();
    });
};
