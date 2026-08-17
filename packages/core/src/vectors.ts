import { type EmbeddedChunk, type MemexClient, replaceNoteChunks, saveEmbedding } from '@memex/db';
import { buildEmbeddingText, chunkNote } from '@memex/utils';

export type Embedder = (text: string) => Promise<number[]>;

export type NoteVectorSource = {
  title: string;
  content: string;
  folder?: string;
  tags?: string[];
};

export const embedNote = async (embedder: Embedder, note: NoteVectorSource) =>
  embedder(buildEmbeddingText(note.title, note.content, note.folder, note.tags));

export const indexChunks = async (
  client: MemexClient,
  embedder: Embedder,
  noteId: number,
  note: NoteVectorSource,
) => {
  const chunks = await chunkNote(note).reduce(async (pending, chunk) => {
    const done = await pending;
    return [
      ...done,
      {
        ord: chunk.ord,
        heading: chunk.heading,
        excerpt: chunk.excerpt,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        embedding: await embedder(chunk.text),
      },
    ];
  }, Promise.resolve<EmbeddedChunk[]>([]));
  replaceNoteChunks(client, noteId, chunks);
  return chunks.length;
};

export const indexNoteVectors = async (
  client: MemexClient,
  embedder: Embedder,
  noteId: number,
  note: NoteVectorSource,
  embedding?: number[],
) => {
  saveEmbedding(client, noteId, embedding ?? (await embedNote(embedder, note)));
  return indexChunks(client, embedder, noteId, note);
};
