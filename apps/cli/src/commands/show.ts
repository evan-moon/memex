import { getAmendments, getNote, openDb } from '@memex/db';
import { CONFIG_DIR, formatDate } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { layerBadge } from '../layer.ts';

export const registerShow = (program: Command) => {
  program
    .command('show <id>')
    .description('Show full note content')
    .action((id: string) => {
      const client = openDb(CONFIG_DIR);
      const note = getNote(client, Number(id));

      if (!note) {
        console.error(pc.red(`Note #${id} not found.`));
        process.exit(1);
      }

      const amendments = getAmendments(client, note.id);

      console.log();
      console.log(`${layerBadge(note.layer)} ${pc.bold(`# ${note.title}`)}`);
      if (amendments.length > 0) {
        console.log(pc.yellow(`⚠ corrected by ${amendments.length} later note(s):`));
        for (const a of amendments) console.log(pc.yellow(`  #${a.id} ${a.title}`));
      }
      console.log();
      console.log(note.content);
      console.log();
      console.log(
        pc.dim(
          `id: ${note.id} | layer: ${note.layer} | source: ${note.source} | created: ${formatDate(new Date(note.createdAt))}`,
        ),
      );

      const flashbackLinks = client.sqlite
        .prepare(
          "SELECT n.id, n.title FROM note_links l JOIN notes n ON n.id = l.source_id WHERE l.target_id = ? AND l.source = 'flashback'",
        )
        .all(Number(id)) as { id: number; title: string }[];

      if (flashbackLinks.length > 0) {
        console.log();
        console.log(pc.dim('--- Surfaced as flashback in ---'));
        for (const f of flashbackLinks) {
          console.log(`${pc.dim(`[#${f.id}]`)} ${f.title}`);
        }
      }
    });
};
