import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  deleteNote,
  findFlashbacks,
  findSimilarByEmbedding,
  getNote,
  insertNote,
  parseTags,
  saveEmbedding,
  searchNotes as dbSearchNotes,
  serializeTags,
  syncLinks,
  updateNote,
  type Flashback,
  type FlashbackOptions,
  type MemexClient,
  type Note,
  type NoteLayer,
  type NoteSource,
  type SimilarNote,
} from '@memex/db';
import type { Reranker } from '@memex/rerank';
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

const readFlashbackOptions = (): FlashbackOptions => ({
  minDaysGap: process.env.MEMEX_FLASHBACK_DAYS
    ? Number(process.env.MEMEX_FLASHBACK_DAYS)
    : undefined,
  maxDistance: process.env.MEMEX_FLASHBACK_DIST
    ? Number(process.env.MEMEX_FLASHBACK_DIST)
    : undefined,
  limit: process.env.MEMEX_FLASHBACK_LIMIT
    ? Number(process.env.MEMEX_FLASHBACK_LIMIT)
    : undefined,
});

const persistFlashbackLinks = (
  client: MemexClient,
  sourceId: number,
  flashbacks: Flashback[],
): void => {
  const insert = client.sqlite.prepare(
    "INSERT OR IGNORE INTO note_links(source_id, target_id, source) VALUES (?, ?, 'flashback')",
  );
  for (const f of flashbacks) insert.run(sourceId, f.id);
};

export const saveNote = async (
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
  params: { title: string; content: string; source: NoteSource; layer: NoteLayer; folder?: string; tags?: string[] },
): Promise<{ note: Note; similar: SimilarNote[]; flashbacks: Flashback[] }> => {
  const embedding = await embedder(buildEmbeddingText(params.title, params.content, params.folder, params.tags));
  const similar = findSimilarByEmbedding(client, embedding, 0.5, 3);

  const filePath = generateFilePath(vaultPath, params.title, params.folder);
  writeFileSync(filePath, `# ${params.title}\n\n${params.content}`, 'utf8');

  const category = extractCategory(params.folder);
  const tags = serializeTags(params.tags ?? []);
  const note = insertNote(client, { ...params, filePath, category: category ?? undefined, tags });
  saveEmbedding(client, note.id, embedding);
  syncLinks(client, note.id, params.content);

  const flashbacks = findFlashbacks(client, note.id, embedding, Date.now(), readFlashbackOptions());
  persistFlashbackLinks(client, note.id, flashbacks);

  return { note, similar, flashbacks };
};

export const semanticSearch = async (
  client: MemexClient,
  embedder: Embedder,
  reranker: Reranker | null,
  query: string,
  limit: number,
  category?: string,
  tag?: string,
  dateFrom?: number,
  dateTo?: number,
) => {
  const overfetch = reranker ? Math.min(50, limit * 10) : limit;
  const embedding = await embedder(query, 'query');
  const candidates = dbSearchNotes(
    client,
    query,
    embedding,
    overfetch,
    category,
    tag,
    dateFrom,
    dateTo,
  );

  if (!reranker || candidates.length <= limit) return candidates.slice(0, limit);

  const scores = await reranker(
    query,
    candidates.map((c) => `${c.title}\n\n${c.content}`),
  );

  return candidates
    .map((note, i) => ({ ...note, distance: -scores[i] }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
};

export type EditNoteRejection =
  | {
      error: 'PAST_IMMUTABLE';
      message: string;
      suggestion: { action: 'save_note'; title: string; link: string; layer: NoteLayer };
    }
  | { error: 'RULE_USER_ONLY'; message: string };

export const editNote = async (
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
  id: number,
  patch: { title?: string; content?: string; tags?: string[] },
): Promise<Note | EditNoteRejection | null> => {
  const note = getNote(client, id);
  if (!note) return null;

  if (note.layer === 'past') {
    return {
      error: 'PAST_IMMUTABLE',
      message: 'past notes are immutable. Create an Amendment note instead.',
      suggestion: {
        action: 'save_note',
        title: `[Amendment] ${note.title}`,
        link: `[[${note.title}]]`,
        layer: 'past',
      },
    };
  }

  if (note.layer === 'rule') {
    return {
      error: 'RULE_USER_ONLY',
      message: 'rule notes can only be edited by the user. Surface your proposed change in chat.',
    };
  }

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
  syncLinks(client, id, content);

  return updated;
};

export const isEditRejection = (
  result: Note | EditNoteRejection | null,
): result is EditNoteRejection =>
  result !== null && typeof result === 'object' && 'error' in result;

export const removeNote = (client: MemexClient, id: number, filePath: string): void => {
  if (existsSync(filePath)) unlinkSync(filePath);
  deleteNote(client, id);
};
