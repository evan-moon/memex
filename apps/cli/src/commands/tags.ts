import { openDb } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { registerTagsTidy } from './tags-tidy.ts';

export const registerTags = (program: Command) => {
  const tags = program.command('tags').description('List all tags with note counts');

  registerTagsTidy(tags);

  tags.action(() => {
    const client = openDb(CONFIG_DIR);

    const rows = client.sqlite
      .prepare(
        `SELECT t.value AS tag, COUNT(*) AS count
           FROM notes n, json_each(n.tags) t
           GROUP BY t.value
           ORDER BY count DESC, t.value ASC`,
      )
      .all() as { tag: string; count: number }[];

    if (rows.length === 0) {
      console.log(pc.dim('No tags found.'));
      return;
    }

    for (const { tag, count } of rows) {
      console.log(`${pc.bold(tag)}  ${pc.dim(`${count} note${count !== 1 ? 's' : ''}`)}`);
    }
  });
};
