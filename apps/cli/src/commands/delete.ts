import { cancel, confirm, isCancel } from '@clack/prompts';
import { removeNote } from '@memex/core';
import { getNote, openDb } from '@memex/db';
import { CONFIG_DIR, expandPath, loadConfig } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';

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
        if (isCancel(confirmed) || !confirmed) {
          cancel();
          process.exit(0);
        }
      }

      const rejection = removeNote(client, note.id, note.filePath, {
        actor: 'user',
        vaultPath: expandPath(loadConfig().vault_path),
      });
      if (rejection) {
        console.error(pc.red(rejection.message));
        process.exit(1);
      }

      console.log(pc.green(`Deleted note #${note.id}: "${note.title}"`));
    });
};
