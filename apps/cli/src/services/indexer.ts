import { existsSync, readFileSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { indexNoteVectors } from '@memex/core';
import {
  deleteNote,
  getNoteByFilePath,
  insertNote,
  listNotesByPathPrefix,
  type MemexClient,
  type NoteLayer,
  parseAuthoredAt,
  parseTags,
  serializeTags,
  updateNote,
} from '@memex/db';
import { extractCategory } from '@memex/utils';

type Embedder = (text: string) => Promise<number[]>;

type IndexStats = {
  added: number;
  updated: number;
  removed: number;
  skipped: number;
};

type ExtractedNote = {
  title: string;
  body: string;
  tags: string[];
  layer?: NoteLayer;
};

const unquote = (value: string): string =>
  value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^#/, '');

// Obsidian writes tags either inline (`tags: [a, b]` / `tags: a, b`) or as a
// block list (`tags:` followed by `- a` lines). Both must survive indexing or
// vault tags never reach the tag search arm.
const parseFrontmatterTags = (frontmatter: string): string[] => {
  const lines = frontmatter.split('\n');
  const idx = lines.findIndex((l) => /^tags:/.test(l));
  if (idx === -1) return [];

  const inline = lines[idx].slice('tags:'.length).trim();
  if (inline.length > 0) {
    const inner = inline.startsWith('[') && inline.endsWith(']') ? inline.slice(1, -1) : inline;
    return inner.split(',').map(unquote).filter(Boolean);
  }

  const items: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s+(.*)$/);
    if (!m) break;
    items.push(unquote(m[1]));
  }
  return items.filter(Boolean);
};

const extractNote = (content: string, filePath: string): ExtractedNote => {
  const frontmatter =
    content.startsWith('---') && content.indexOf('\n---', 3) !== -1
      ? content.slice(3, content.indexOf('\n---', 3))
      : undefined;

  const tags = frontmatter ? parseFrontmatterTags(frontmatter) : [];
  const layer = frontmatter?.match(/^layer:\s*["']?(past|state|rule)["']?\s*$/m)?.[1] as
    | NoteLayer
    | undefined;

  const fmTitle = frontmatter?.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  if (fmTitle) return { title: fmTitle, body: content, tags, layer };

  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return { title: h1[1].trim(), body: content, tags, layer };

  return { title: basename(filePath, extname(filePath)), body: content, tags, layer };
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
  const { title, body, tags: fmTags, layer } = extractNote(content, filePath);

  const relDir = relative(dirPath, dirname(filePath));
  const folder = relDir && !relDir.startsWith('..') ? relDir : undefined;
  const category = extractCategory(folder);

  // Temporal signals (flashback, hidden_arc spans, date filters) need the real
  // authoring date — created_at here is just the moment the file was indexed.
  const authoredAt = parseAuthoredAt(title, body) ?? undefined;

  if (existing) {
    // The file is the source of truth for frontmatter tags; tags added in-app
    // survive only when the file declares none.
    const tags = fmTags.length > 0 ? fmTags : parseTags(existing.tags);
    updateNote(client, existing.id, {
      title,
      content: body,
      category: category ?? undefined,
      authoredAt,
      tags: serializeTags(tags),
    });
    client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(existing.id));
    await indexNoteVectors(client, embedder, existing.id, { title, content: body, folder, tags });
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
        tags: serializeTags(fmTags),
        layer,
      });
      await indexNoteVectors(client, embedder, note.id, {
        title,
        content: body,
        folder,
        tags: fmTags,
      });
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
      deleteNote(client, note.id);
      stats.removed++;
    }
  }

  return stats;
};
