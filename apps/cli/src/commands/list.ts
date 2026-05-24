import type { Command } from 'commander';
import pc from 'picocolors';
import { openDb, listNotes, countNotes } from '@memex/db';
import { CONFIG_DIR, formatDate } from '@memex/utils';
import { layerBadge } from '../layer.ts';

export const registerList = (program: Command) => {
  program
    .command('list')
    .description('List recent notes')
    .option('-l, --limit <n>', 'Max results', '10')
    .action((opts: { limit: string }) => {
      const client = openDb(CONFIG_DIR);
      const total = countNotes(client);
      const notes = listNotes(client, Number(opts.limit));

      if (notes.length === 0) {
        console.log(pc.dim('No notes yet.'));
        return;
      }

      console.log(pc.dim(`${total} notes total — showing ${notes.length}\n`));
      for (const note of notes) {
        const date = formatDate(new Date(note.createdAt));
        console.log(`${pc.dim(`[${note.id}]`)} ${layerBadge(note.layer)} ${note.title} ${pc.dim(date)}`);
      }
    });
};
