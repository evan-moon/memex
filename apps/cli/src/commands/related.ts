import type { Command } from 'commander';
import pc from 'picocolors';
import { openDb, getNote, findRelatedNotes } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';

export const registerRelated = (program: Command) => {
  program
    .command('related <id>')
    .description('Find notes related to a given note by embedding similarity and shared tags')
    .option('-l, --limit <n>', 'Max results', '10')
    .action((id: string, opts: { limit: string }) => {
      const client = openDb(CONFIG_DIR);

      const source = getNote(client, Number(id));
      if (!source) {
        console.error(pc.red(`Note #${id} not found.`));
        process.exit(1);
      }

      const results = findRelatedNotes(client, Number(id), Number(opts.limit));

      if (results.length === 0) {
        console.log(pc.dim('No related notes found.'));
        return;
      }

      console.log(`\nRelated to ${pc.bold(`#${source.id}`)} "${source.title}"\n`);

      for (const note of results) {
        const pct = Math.round(note.score * 100);
        const bar = pct >= 80 ? pc.green(`${pct}%`) : pct >= 50 ? pc.yellow(`${pct}%`) : pc.dim(`${pct}%`);
        const category = note.category ? pc.dim(`[${note.category}]`) : '';
        const tags =
          note.sharedTags.length > 0
            ? pc.cyan(note.sharedTags.join(', '))
            : '';

        console.log(`${bar.padEnd(8)} ${pc.bold(`#${note.id}`)} ${note.title}  ${category}`);
        if (tags) console.log(`         ${tags}`);
      }
    });
};
