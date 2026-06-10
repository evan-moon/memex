import { existsSync, readFileSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import {
  deleteNote,
  getNoteByFilePath,
  insertNote,
  listNotesByPathPrefix,
  type MemexClient,
  parseAuthoredAt,
  parseTags,
  saveEmbedding,
  updateNote,
} from '@memex/db';
import { buildEmbeddingText, extractCategory } from '@memex/utils';

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
  dirPath: string,
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

  const relDir = relative(dirPath, dirname(filePath));
  const folder = relDir && !relDir.startsWith('..') ? relDir : undefined;
  const category = extractCategory(folder);

  // Temporal signals (flashback, hidden_arc spans, date filters) need the real
  // authoring date — created_at here is just the moment the file was indexed.
  const authoredAt = parseAuthoredAt(title, body) ?? undefined;

  if (existing) {
    updateNote(client, existing.id, {
      title,
      content: body,
      category: category ?? undefined,
      authoredAt,
    });
    const tags = parseTags(existing.tags);
    const embedding = await embedder(buildEmbeddingText(title, body, folder, tags));
    client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(existing.id));
    saveEmbedding(client, existing.id, embedding);
    stats.updated++;
  } else {
    try {
      const note = insertNote(client, {
        title,
        content: body,
        filePath,
        source: 'index',
        category: category ?? undefined,
        authoredAt,
      });
      const embedding = await embedder(buildEmbeddingText(title, body, folder));
      saveEmbedding(client, note.id, embedding);
      stats.added++;
    } catch {
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

const isIgnoredPath = (filePath: string): boolean =>
  filePath.split('/').some((segment) => IGNORE_DIRS.includes(segment));

export const indexDirectory = async (
  client: MemexClient,
  embedder: Embedder,
  dirPath: string,
  onProgress?: (file: string) => void,
  force = false,
): Promise<IndexStats> => {
  const stats: IndexStats = { added: 0, updated: 0, removed: 0, skipped: 0 };

  const files: string[] = [];
  // The exclude callback sees paths like "sub/node_modules", so match path
  // segments — a bare-name check only prunes ignored dirs at the top level.
  for await (const file of glob('**/*.md', { cwd: dirPath, exclude: (f) => isIgnoredPath(f) })) {
    files.push(join(dirPath, file));
  }

  const CONCURRENCY = 4;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    await Promise.all(
      files.slice(i, i + CONCURRENCY).map((filePath) => {
        onProgress?.(filePath);
        return indexFile(client, embedder, filePath, dirPath, stats, force);
      }),
    );
  }

  const fileSet = new Set(files);
  for (const note of listNotesByPathPrefix(client, dirPath)) {
    if (
      isIgnoredPath(note.filePath) ||
      (!fileSet.has(note.filePath) && !existsSync(note.filePath))
    ) {
      client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(note.id));
      deleteNote(client, note.id);
      stats.removed++;
    }
  }

  return stats;
};
