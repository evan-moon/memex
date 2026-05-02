import type { Command } from 'commander';
import pc from 'picocolors';
import { openDb, getNote } from '@memex/db';
import { loadConfig, expandPath, formatDate, CONFIG_DIR } from '@memex/utils';

export const registerShow = (program: Command) => {
  program
    .command('show <id>')
    .description('Show full note content')
    .action((id: string) => {
      const config = loadConfig();
      const vaultPath = expandPath(config.vault_path);
      const client = openDb(CONFIG_DIR);
      const note = getNote(client, Number(id));

      if (!note) {
        console.error(pc.red(`Note #${id} not found.`));
        process.exit(1);
      }

      console.log();
      console.log(pc.bold(`# ${note.title}`));
      console.log();
      console.log(note.content);
      console.log();
      console.log(pc.dim(`id: ${note.id} | source: ${note.source} | created: ${formatDate(new Date(note.createdAt))}`));
    });
};
