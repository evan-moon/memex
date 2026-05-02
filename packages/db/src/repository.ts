import { desc, eq } from 'drizzle-orm';
import type { MemexClient } from './client.ts';
import { notes, type NewNote, type Note } from './schema.ts';

type SearchResult = Note & { distance: number };

export const insertNote = (client: MemexClient, note: NewNote): Note => {
  const now = Date.now();
  const [inserted] = client.db
    .insert(notes)
    .values({ ...note, createdAt: now, updatedAt: now })
    .returning()
    .all();
  return inserted;
};

export const saveEmbedding = (client: MemexClient, noteId: number, embedding: number[]): void => {
  const vec = new Float32Array(embedding);
  // better-sqlite3 passes JS numbers as SQLite REAL; BigInt binds as INTEGER (required by vec0 PK)
  client.sqlite
    .prepare('INSERT OR REPLACE INTO note_embeddings(note_id, embedding) VALUES (?, ?)')
    .run(BigInt(noteId), Buffer.from(vec.buffer));
};

export const searchNotes = (
  client: MemexClient,
  query: string,
  embedding: number[],
  limit = 10,
): SearchResult[] => {
  const vec = new Float32Array(embedding);
  const vectorResults = client.sqlite
    .prepare(
      `SELECT n.*, e.distance
       FROM note_embeddings e
       JOIN notes n ON n.id = e.note_id
       WHERE e.embedding MATCH ?
       AND k = ?
       ORDER BY e.distance`,
    )
    .all(Buffer.from(vec.buffer), limit * 2) as SearchResult[];

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `%${t}%`);

  const seen = new Map<number, SearchResult>();
  for (const r of vectorResults) seen.set(r.id, r);

  if (tokens.length > 0) {
    const conditions = tokens
      .map(() => '(lower(title) LIKE ? OR lower(content) LIKE ?)')
      .join(' AND ');
    const bindings = tokens.flatMap((t) => [t, t]);
    const keywordResults = client.sqlite
      .prepare(`SELECT * FROM notes WHERE ${conditions} LIMIT ?`)
      .all(...bindings, limit) as Note[];

    for (const r of keywordResults) {
      const titleMatch = tokens.every((t) => r.title.toLowerCase().includes(t.slice(1, -1)));
      const synthetic = titleMatch ? 0.1 : 0.4;
      if (!seen.has(r.id) || seen.get(r.id)!.distance > synthetic) {
        seen.set(r.id, { ...r, distance: synthetic });
      }
    }
  }

  return [...seen.values()].sort((a, b) => a.distance - b.distance).slice(0, limit);
};

export const listNotes = (client: MemexClient, limit = 20): Note[] =>
  client.db.select().from(notes).orderBy(desc(notes.createdAt)).limit(limit).all();

export const getNote = (client: MemexClient, id: number): Note | undefined =>
  client.db.select().from(notes).where(eq(notes.id, id)).get();

export const getNoteByFilePath = (client: MemexClient, filePath: string): Note | undefined =>
  client.db.select().from(notes).where(eq(notes.filePath, filePath)).get();

export const listNotesByPathPrefix = (client: MemexClient, prefix: string): Note[] =>
  client.db.select().from(notes).all().filter((n) => n.filePath.startsWith(prefix));

export const deleteNote = (client: MemexClient, id: number): void => {
  client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(id));
  client.db.delete(notes).where(eq(notes.id, id)).run();
};

export const updateNote = (
  client: MemexClient,
  id: number,
  patch: Partial<Pick<NewNote, 'title' | 'content'>>,
): Note => {
  const [updated] = client.db
    .update(notes)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return updated;
};
