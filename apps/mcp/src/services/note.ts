import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deleteNote,
  getNote,
  insertNote,
  saveEmbedding,
  searchNotes as dbSearchNotes,
  updateNote,
  type MemexClient,
  type NoteSource,
} from '@memex/db';

type Embedder = (text: string) => Promise<number[]>;

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
  params: { title: string; content: string; source: NoteSource; folder?: string },
) => {
  const filePath = generateFilePath(vaultPath, params.title, params.folder);
  writeFileSync(filePath, `# ${params.title}\n\n${params.content}`, 'utf8');

  const note = insertNote(client, { ...params, filePath });
  const embedding = await embedder(`${params.title}\n\n${params.content}`);
  saveEmbedding(client, note.id, embedding);

  return note;
};

export const semanticSearch = async (
  client: MemexClient,
  embedder: Embedder,
  query: string,
  limit: number,
  aliases: Record<string, string[]> = {},
) => {
  const embedding = await embedder(query);
  return dbSearchNotes(client, query, embedding, limit, aliases);
};

export const editNote = async (
  client: MemexClient,
  embedder: Embedder,
  id: number,
  patch: { title?: string; content?: string },
) => {
  const note = getNote(client, id);
  if (!note) return null;

  const updated = updateNote(client, id, patch);
  const title = patch.title ?? note.title;
  const content = patch.content ?? note.content;

  writeFileSync(updated.filePath, `# ${title}\n\n${content}`, 'utf8');

  client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(id));
  const embedding = await embedder(`${title}\n\n${content}`);
  saveEmbedding(client, id, embedding);

  return updated;
};

export const removeNote = (client: MemexClient, id: number, filePath: string): void => {
  if (existsSync(filePath)) unlinkSync(filePath);
  deleteNote(client, id);
};
