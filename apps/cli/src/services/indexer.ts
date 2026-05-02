import { existsSync, readFileSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import {
  getNoteByFilePath,
  insertNote,
  listNotesByPathPrefix,
  saveEmbedding,
  updateNote,
  deleteNote,
  type MemexClient,
} from '@memex/db';

type Embedder = (text: string) => Promise<number[]>;

type IndexStats = {
  added: number;
  updated: number;
  removed: number;
  skipped: number;
};

const extractNote = (content: string, filePath: string): { title: string; body: string } => {
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      const frontmatter = content.slice(3, end);
      const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      if (titleMatch) {
        return { title: titleMatch[1].trim(), body: content };
      }
    }
  }

  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return { title: h1[1].trim(), body: content };

  return { title: basename(filePath, extname(filePath)), body: content };
};

const indexFile = async (
  client: MemexClient,
  embedder: Embedder,
  filePath: string,
  stats: IndexStats,
  force = false,
): Promise<void> => {
  const mtime = statSync(filePath).mtimeMs;
  const existing = getNoteByFilePath(client, filePath);

  if (!force && existing && existing.updatedAt >= mtime) {
    stats.skipped++;
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  const { title, body } = extractNote(content, filePath);
  const embedding = await embedder(`${title}\n\n${body}`);

  if (existing) {
    updateNote(client, existing.id, { title, content: body });
    client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(existing.id));
    saveEmbedding(client, existing.id, embedding);
    stats.updated++;
  } else {
    try {
      const note = insertNote(client, { title, content: body, filePath, source: 'index' });
      saveEmbedding(client, note.id, embedding);
      stats.added++;
    } catch {
      // File was already inserted by a concurrent scan (e.g. overlapping source paths)
      stats.skipped++;
    }
  }
};

const IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.nuxt',
  '.memex',
  '.yarn',
  'coverage',
  '.cache',
];

export const indexDirectory = async (
  client: MemexClient,
  embedder: Embedder,
  dirPath: string,
  onProgress?: (file: string) => void,
  force = false,
): Promise<IndexStats> => {
  const stats: IndexStats = { added: 0, updated: 0, removed: 0, skipped: 0 };

  const files: string[] = [];
  for await (const file of glob('**/*.md', { cwd: dirPath, exclude: (f) => IGNORE_DIRS.includes(f) })) {
    files.push(join(dirPath, file));
  }

  for (const filePath of files) {
    onProgress?.(filePath);
    await indexFile(client, embedder, filePath, stats, force);
  }

  // Remove notes whose files no longer exist on disk
  const fileSet = new Set(files);
  for (const note of listNotesByPathPrefix(client, dirPath)) {
    if (!fileSet.has(note.filePath) && !existsSync(note.filePath)) {
      client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(note.id));
      deleteNote(client, note.id);
      stats.removed++;
    }
  }

  return stats;
};
