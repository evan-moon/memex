import { readFileSync } from 'node:fs';
import { intro, outro, text, isCancel, cancel, spinner } from '@clack/prompts';
import type { Command } from 'commander';
import { openDb, getNote } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { loadConfig, expandPath, MODEL_CACHE_DIR } from '@memex/utils';
import { editNote } from '../services/note.ts';
import pc from 'picocolors';

export const registerEdit = (program: Command) => {
  program
    .command('edit <id>')
    .description('Edit an existing note')
    .option('-t, --title <title>', 'New title')
    .option('-c, --content <content>', 'New content')
    .option('-f, --file <path>', 'Read new content from a file')
    .action(async (id: string, opts: { title?: string; content?: string; file?: string }) => {
      const config = loadConfig();
      const vaultPath = expandPath(config.vault_path);
      const client = openDb(vaultPath);
      const note = getNote(client, Number(id));

      if (!note) {
        console.error(pc.red(`Note #${id} not found.`));
        process.exit(1);
      }

      intro(`memex edit — #${note.id}: "${note.title}"`);

      let title = opts.title;
      let content = opts.content;

      if (!title && !content && !opts.file) {
        const titleRes = await text({
          message: 'Title',
          initialValue: note.title,
        });
        if (isCancel(titleRes)) { cancel(); process.exit(0); }
        title = titleRes as string;

        const contentRes = await text({
          message: 'Content',
          initialValue: note.content,
        });
        if (isCancel(contentRes)) { cancel(); process.exit(0); }
        content = contentRes as string;
      }

      if (opts.file) content = readFileSync(opts.file, 'utf8');

      const s = spinner();
      s.start('Updating...');

      try {
        const embedder = await createEmbedder(MODEL_CACHE_DIR);
        const updated = await editNote(client, embedder, Number(id), {
          title: title || undefined,
          content: content || undefined,
        });

        s.stop(`Updated note #${updated!.id}: "${updated!.title}"`);
        outro('Done');
      } catch (err) {
        s.stop('Failed');
        console.error(err);
        process.exit(1);
      }
    });
};
