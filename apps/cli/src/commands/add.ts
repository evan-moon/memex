import { readFileSync } from 'node:fs';
import { cancel, intro, isCancel, outro, select, spinner, text } from '@clack/prompts';
import { isSaveRejection, saveNote } from '@memex/core';
import { type NoteLayer, type NoteSource, openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { CONFIG_DIR, expandPath, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';

const LAYERS: ReadonlyArray<NoteLayer> = ['past', 'state', 'rule'];

export const registerAdd = (program: Command) => {
  program
    .command('add')
    .description('Add a note to the second brain')
    .option('-t, --title <title>', 'Note title')
    .option('-c, --content <content>', 'Note content')
    .option('-f, --file <path>', 'Read content from a file')
    .option('-d, --folder <folder>', 'Subfolder within the vault (e.g. projects/memex)')
    .option(
      '-T, --tag <tag>',
      'Tag to attach (repeatable: -T typescript -T architecture)',
      (v, acc: string[]) => [...acc, v],
      [] as string[],
    )
    .option('-s, --source <source>', 'Source (manual|herald|claude-code)', 'manual')
    .option('-L, --layer <layer>', 'Mutability layer (past|state|rule)')
    .action(
      async (opts: {
        title?: string;
        content?: string;
        file?: string;
        folder?: string;
        tag: string[];
        source: string;
        layer?: string;
      }) => {
        intro('memex add');

        let title = opts.title;
        let content = opts.content;
        let layer = opts.layer as NoteLayer | undefined;

        if (layer && !LAYERS.includes(layer)) {
          cancel(`Invalid --layer "${layer}". Expected one of: ${LAYERS.join(', ')}.`);
          process.exit(1);
        }

        if (!title) {
          const res = await text({ message: 'Title', placeholder: 'My note title' });
          if (isCancel(res)) {
            cancel();
            process.exit(0);
          }
          title = res as string;
        }

        if (!content) {
          if (opts.file) {
            content = readFileSync(opts.file, 'utf8');
          } else {
            const res = await text({ message: 'Content', placeholder: 'Note content...' });
            if (isCancel(res)) {
              cancel();
              process.exit(0);
            }
            content = res as string;
          }
        }

        if (!layer) {
          const res = await select({
            message: 'Layer',
            options: [
              { value: 'past', label: 'past   immutable record of what happened' },
              { value: 'state', label: 'state  current state or plan, freely updatable' },
              { value: 'rule', label: 'rule   Claude behavior guide (user writes only)' },
            ],
            initialValue: 'past',
          });
          if (isCancel(res)) {
            cancel();
            process.exit(0);
          }
          layer = res as NoteLayer;
        }

        const s = spinner();
        s.start('Loading embedder...');

        try {
          const config = loadConfig();
          const vaultPath = expandPath(config.vault_path);
          const client = openDb(CONFIG_DIR);
          guardEmbeddingModel(client);
          const embedder = await createEmbedder(MODEL_CACHE_DIR);

          s.message('Saving note...');
          const result = await saveNote(client, embedder, vaultPath, {
            title,
            content,
            source: opts.source as NoteSource,
            layer,
            folder: opts.folder,
            tags: opts.tag.length > 0 ? opts.tag : undefined,
            actor: 'user',
          });
          if (isSaveRejection(result)) {
            s.stop(pc.red(result.message));
            process.exit(1);
          }
          const { note, flashbacks } = result;

          s.stop(`Saved note #${note.id}: "${note.title}"`);
          if (flashbacks.length > 0) {
            console.log();
            console.log(pc.dim('--- Flashback ---'));
            for (const f of flashbacks) {
              console.log(`${pc.dim(`[#${f.id}]`)} ${pc.dim(`${f.daysAgo}d ago`)} ${f.title}`);
            }
          }
          outro('Done');
        } catch (err) {
          s.stop('Failed');
          console.error(err);
          process.exit(1);
        }
      },
    );
};
