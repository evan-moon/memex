import { readFileSync } from 'node:fs';
import { cancel, intro, isCancel, outro, spinner, text } from '@clack/prompts';
import { editNote, isEditRejection } from '@memex/core';
import { getNote, openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { CONFIG_DIR, expandPath, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';

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
      const client = openDb(CONFIG_DIR);
      guardEmbeddingModel(client);
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
        if (isCancel(titleRes)) {
          cancel();
          process.exit(0);
        }
        title = titleRes as string;

        const contentRes = await text({
          message: 'Content',
          initialValue: note.content,
        });
        if (isCancel(contentRes)) {
          cancel();
          process.exit(0);
        }
        content = contentRes as string;
      }

      if (opts.file) content = readFileSync(opts.file, 'utf8');

      const s = spinner();
      s.start('Updating...');

      try {
        const embedder = await createEmbedder(MODEL_CACHE_DIR);
        const result = await editNote(client, embedder, vaultPath, Number(id), {
          title: title || undefined,
          content: content || undefined,
        });

        if (isEditRejection(result)) {
          s.stop(pc.yellow(result.message));
          if (result.error === 'PAST_IMMUTABLE') {
            console.log(
              pc.dim(
                `Suggested: memex add --layer past --amends ${result.suggestion.amends} -t "${result.suggestion.title}" (link with ${result.suggestion.link})`,
              ),
            );
          }
          process.exit(1);
        }

        s.stop(`Updated note #${result!.id}: "${result!.title}"`);
        outro('Done');
      } catch (err) {
        s.stop('Failed');
        console.error(err);
        process.exit(1);
      }
    });
};
