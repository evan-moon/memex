import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deleteNote,
  insertNote,
  saveEmbedding,
  searchNotes as dbSearchNotes,
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
) => {
  const embedding = await embedder(query);
  return dbSearchNotes(client, embedding, limit);
};

export const removeNote = (client: MemexClient, id: number, filePath: string): void => {
  if (existsSync(filePath)) unlinkSync(filePath);
  deleteNote(client, id);
};
