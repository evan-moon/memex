import type { Command } from 'commander';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { openDb, listNotes, parseTags, saveEmbedding, updateNote } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { loadConfig, expandPath, CONFIG_DIR, MODEL_CACHE_DIR, buildEmbeddingText, extractCategory } from '@memex/utils';
import { dirname, relative } from 'node:path';

export const registerReembed = (program: Command) => {
  program
    .command('reembed')
    .description('Re-generate embeddings for all notes using folder-prefixed format and populate category column')
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

        for (const note of notes) {
          s.message(`Re-embedding ${done + 1}/${notes.length}: "${note.title}"`);

          const base = basePaths.find((p) => note.filePath.startsWith(p));
          const relDir = base ? relative(base, dirname(note.filePath)) : undefined;
          const folder = relDir && !relDir.startsWith('..') ? relDir : undefined;
          const category = extractCategory(folder);

          const tags = parseTags(note.tags);
          const embedding = await embedder(buildEmbeddingText(note.title, note.content, folder, tags));
          client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(note.id));
          saveEmbedding(client, note.id, embedding);

          if (note.category !== category) {
            updateNote(client, note.id, { category: category ?? undefined });
          }

          done++;
        }

        s.stop(pc.green(`Re-embedded ${done} notes`));
      } catch (err) {
        s.stop('Failed');
        console.error(err);
        process.exit(1);
      }
    });
};
