import { dirname, relative } from 'node:path';
import { spinner } from '@clack/prompts';
import { indexNoteVectors } from '@memex/core';
import { listNotes, markReembedded, openDb, parseTags, updateNote } from '@memex/db';
import { createEmbedder, EMBEDDING_MODEL_ID } from '@memex/embed';
import { CONFIG_DIR, expandPath, extractCategory, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';

export const registerReembed = (program: Command) => {
  program
    .command('reembed')
    .description(
      'Re-generate embeddings for all notes using folder-prefixed format and populate category column',
    )
    .action(async () => {
      const s = spinner();
      s.start('Loading embedder...');

      try {
        const config = loadConfig();
        const vaultPath = expandPath(config.vault_path);
        const sourcePaths = config.sources.map((src) => expandPath(src.path));
        const basePaths = [vaultPath, ...sourcePaths];

        const client = openDb(CONFIG_DIR);
        const embedder = await createEmbedder(MODEL_CACHE_DIR);

        const notes = listNotes(client, 100_000);
        let done = 0;
        let chunks = 0;

        for (const note of notes) {
          s.message(`Re-embedding ${done + 1}/${notes.length} (${chunks} chunks): "${note.title}"`);

          const base = basePaths.find((p) => note.filePath.startsWith(p));
          const relDir = base ? relative(base, dirname(note.filePath)) : undefined;
          const folder = relDir && !relDir.startsWith('..') ? relDir : undefined;
          const category = extractCategory(folder);

          const tags = parseTags(note.tags);
          chunks += await indexNoteVectors(client, embedder, note.id, {
            title: note.title,
            content: note.content,
            folder,
            tags,
          });

          if (note.category !== category) {
            updateNote(client, note.id, { category: category ?? undefined });
          }

          done++;
        }

        markReembedded(client, EMBEDDING_MODEL_ID);
        s.stop(pc.green(`Re-embedded ${done} notes into ${chunks} chunks`));
      } catch (err) {
        s.stop('Failed');
        console.error(err);
        process.exit(1);
      }
    });
};
