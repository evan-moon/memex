import type { Command } from 'commander';
import { confirm, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { openDb, getNote } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import { removeNote } from '../services/note.ts';

export const registerDelete = (program: Command) => {
  program
    .command('delete <id>')
    .description('Delete a note by ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id: string, opts: { yes?: boolean }) => {
      const client = openDb(CONFIG_DIR);
      const note = getNote(client, Number(id));

      if (!note) {
        console.error(pc.red(`Note #${id} not found.`));
        process.exit(1);
      }

      if (!opts.yes) {
        const confirmed = await confirm({ message: `Delete "${note.title}"?` });
        if (isCancel(confirmed) || !confirmed) { cancel(); process.exit(0); }
      }

      removeNote(client, note.id, note.filePath);
      console.log(pc.green(`Deleted note #${note.id}: "${note.title}"`));
    });
};
