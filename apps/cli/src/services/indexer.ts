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
  resyncLinkIndexes,
  serializeTags,
  setNoteInvalidations,
  syncLinks,
  syncNoteEvidence,
  updateNote,
} from '@memex/db';
import {
  authorOfPath,
  extractCategory,
  parseDerivesFrom,
  parseInvalidates,
  yamlScalar,
} from '@memex/utils';

type Embedder = (text: string) => Promise<number[]>;

type IndexStats = {
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  /** Wiki links the rebuilt graph gained (or lost, when negative). */
  relinked: number;
  /** Notes whose title or link-target index had drifted from their content. */
  reindexed: number;
};

type ExtractedNote = {
  title: string;
  body: string;
  tags: string[];
  layer?: NoteLayer;
};

const unquote = (value: string): string => yamlScalar(value).replace(/^#/, '');

// Frontmatter carries tags either inline (`tags: [a, b]` / `tags: a, b`) or as
// a block list (`tags:` followed by `- a` lines). Both must survive indexing or
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

  const fmTitle = yamlScalar(frontmatter?.match(/^title:[ \t]*(.*)$/m)?.[1] ?? '');
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

  // A skeleton somebody fills in later is not a note. Blacklisting a folder
  // called `templates` would be wrong — a vault may keep real notes in one —
  // so what gives it away is the title: no person names a note `$title`.
  if (isPlaceholderTitle(title)) {
    stats.skipped++;
    return;
  }

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
      author: authorOfPath(filePath),
    });
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
        author: authorOfPath(filePath),
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

// `$title`, `{{ title }}`, `<%* tp.file.title %>` — every template engine's way
// of saying "a title goes here".
// A dollar opens a placeholder only before an identifier: `$title` is one,
// `$5만 디컨센트레이션 코어 매수` is a note about money.
const PLACEHOLDER = /^\s*(\$[A-Za-z_]|\{\{|<%|\[%)/;

export const isPlaceholderTitle = (title: string): boolean => PLACEHOLDER.test(title);

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

// A link lives in one note and points at another, so renaming the second one
// breaks a row the first one owns — and the first one's file never changed, so
// nothing above would touch it. Rebuilding the whole graph costs no embeddings
// and is the only way the index and the vault agree after a rename.
const resyncLinks = (client: MemexClient): number => {
  const notes = client.sqlite.prepare('SELECT id, content FROM notes').all() as {
    id: number;
    content: string;
  }[];
  const before = (
    client.sqlite.prepare("SELECT COUNT(*) AS c FROM note_links WHERE source = 'wiki'").get() as {
      c: number;
    }
  ).c;

  client.sqlite.transaction(() => {
    for (const note of notes) syncLinks(client, note.id, note.content);
  })();

  const after = (
    client.sqlite.prepare("SELECT COUNT(*) AS c FROM note_links WHERE source = 'wiki'").get() as {
      c: number;
    }
  ).c;
  return after - before;
};

// Run after the walk, not during it: a note can declare a source that has not
// been read yet, and an edge to a note the index has never heard of is dropped.
const resyncEvidence = (client: MemexClient) => {
  const notes = client.sqlite.prepare('SELECT id, content FROM notes').all() as {
    id: number;
    content: string;
  }[];
  for (const note of notes) {
    const declared = parseDerivesFrom(note.content);
    if (declared.length > 0) syncNoteEvidence(client, note.id, declared);
    const invalidated = parseInvalidates(note.content);
    if (invalidated.length > 0) setNoteInvalidations(client, note.id, invalidated);
  }
};

export const indexDirectory = async (
  client: MemexClient,
  embedder: Embedder,
  dirPath: string,
  onProgress?: (file: string) => void,
  force = false,
): Promise<IndexStats> => {
  const stats: IndexStats = {
    added: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    relinked: 0,
    reindexed: 0,
  };

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

  const repaired = resyncLinkIndexes(client);
  stats.reindexed = Math.max(repaired.titles, repaired.targets);
  stats.relinked = resyncLinks(client);
  resyncEvidence(client);
  return stats;
};
