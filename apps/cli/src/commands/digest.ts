import type { Command } from 'commander';
import pc from 'picocolors';
import { type Note, openDb, listNotesSince, parseTags } from '@memex/db';
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

      const groups = notesResult.reduce<Map<string, Note[]>>((acc, note) => {
        const key = note.category ?? '(root)';
        return acc.set(key, [...(acc.get(key) ?? []), note]);
      }, new Map());

      console.log();
      console.log(pc.bold(`Digest — last ${days} day(s) since ${sinceDate}`));
      console.log(pc.dim(`${notesResult.length} note(s) across ${groups.size} folder(s)`));

      Array.from(groups.entries()).forEach(([folder, folderNotes]) => {
        console.log();
        console.log(pc.bold(pc.cyan(folder)));
        folderNotes.forEach((note) => {
          const date = formatDate(new Date(note.createdAt));
          const tags = parseTags(note.tags);
          const tagStr = tags.length > 0 ? pc.dim(`  [${tags.join(', ')}]`) : '';
          console.log(`  ${pc.bold(`#${note.id}`)} ${note.title}${tagStr}  ${pc.dim(date)}`);
        });
      });
      console.log();
    });
};
