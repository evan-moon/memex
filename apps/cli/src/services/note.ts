import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  deleteNote,
  getNote,
  insertNote,
  parseTags,
  saveEmbedding,
  searchNotes as dbSearchNotes,
  serializeTags,
  updateNote,
  type MemexClient,
  type NoteSource,
} from '@memex/db';
import { extractCategory, buildEmbeddingText } from '@memex/utils';

type Embedder = (text: string, type?: 'query' | 'passage') => Promise<number[]>;

const sanitizeFilename = (title: string): string =>
  title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .trim();

const generateFilePath = (vaultPath: string, title: string, folder?: string): string => {
  const dir = folder ? join(vaultPath, folder) : vaultPath;
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${sanitizeFilename(title)}.md`);
  if (!existsSync(base)) return base;
  return join(dir, `${sanitizeFilename(title)}-${Date.now()}.md`);
};

export const saveNote = async (
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
  params: { title: string; content: string; source: NoteSource; folder?: string; tags?: string[] },
) => {
  const filePath = generateFilePath(vaultPath, params.title, params.folder);
  writeFileSync(filePath, `# ${params.title}\n\n${params.content}`, 'utf8');

  const category = extractCategory(params.folder);
  const tags = serializeTags(params.tags ?? []);
  const note = insertNote(client, { ...params, filePath, category: category ?? undefined, tags });
  const embedding = await embedder(buildEmbeddingText(params.title, params.content, params.folder, params.tags));
  saveEmbedding(client, note.id, embedding);

  return note;
};

export const semanticSearch = async (
  client: MemexClient,
  embedder: Embedder,
  query: string,
  limit: number,
  category?: string,
  tag?: string,
) => {
  const embedding = await embedder(query, 'query');
  return dbSearchNotes(client, query, embedding, limit, category, tag);
};

export const editNote = async (
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
  id: number,
  patch: { title?: string; content?: string; tags?: string[] },
) => {
  const note = getNote(client, id);
  if (!note) return null;

  const tags = patch.tags !== undefined ? serializeTags(patch.tags) : undefined;
  const updated = updateNote(client, id, { ...patch, tags });
  const title = patch.title ?? note.title;
  const content = patch.content ?? note.content;
  const resolvedTags = patch.tags ?? parseTags(note.tags);

  writeFileSync(updated.filePath, `# ${title}\n\n${content}`, 'utf8');

  const relDir = relative(vaultPath, dirname(note.filePath));
  const folder = relDir && !relDir.startsWith('..') ? relDir : undefined;
  client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(id));
  const embedding = await embedder(buildEmbeddingText(title, content, folder, resolvedTags));
  saveEmbedding(client, id, embedding);

  return updated;
};

export const removeNote = (client: MemexClient, id: number, filePath: string): void => {
  if (existsSync(filePath)) unlinkSync(filePath);
  deleteNote(client, id);
};
