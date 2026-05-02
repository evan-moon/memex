import { readFileSync } from 'node:fs';
import { intro, outro, text, select, spinner, isCancel, cancel } from '@clack/prompts';
import type { Command } from 'commander';
import { openDb, type NoteSource } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { loadConfig, expandPath, MODEL_CACHE_DIR } from '@memex/utils';
import { saveNote } from '../services/note.ts';

export const registerAdd = (program: Command) => {
  program
    .command('add')
    .description('Add a note to the second brain')
    .option('-t, --title <title>', 'Note title')
    .option('-c, --content <content>', 'Note content')
    .option('-f, --file <path>', 'Read content from a file')
    .option('-d, --folder <folder>', 'Subfolder within the vault (e.g. projects/memex)')
    .option('-s, --source <source>', 'Source (manual|herald|claude-code)', 'manual')
    .action(async (opts: { title?: string; content?: string; file?: string; folder?: string; source: string }) => {
      intro('memex add');

      let title = opts.title;
      let content = opts.content;

      if (!title) {
        const res = await text({ message: 'Title', placeholder: 'My note title' });
        if (isCancel(res)) { cancel(); process.exit(0); }
        title = res as string;
      }

      if (!content) {
        if (opts.file) {
          content = readFileSync(opts.file, 'utf8');
        } else {
          const res = await text({ message: 'Content', placeholder: 'Note content...' });
          if (isCancel(res)) { cancel(); process.exit(0); }
          content = res as string;
        }
      }

      const s = spinner();
      s.start('Loading embedder...');

      try {
        const config = loadConfig();
        const vaultPath = expandPath(config.vault_path);
        const client = openDb(vaultPath);
        const embedder = await createEmbedder(MODEL_CACHE_DIR);

        s.message('Saving note...');
        const note = await saveNote(client, embedder, vaultPath, {
          title,
          content,
          source: opts.source as NoteSource,
          folder: opts.folder,
        });

        s.stop(`Saved note #${note.id}: "${note.title}"`);
        outro('Done');
      } catch (err) {
        s.stop('Failed');
        console.error(err);
        process.exit(1);
      }
    });
};
