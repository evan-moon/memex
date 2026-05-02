import { desc, eq, like } from 'drizzle-orm';
import type { MemexClient } from './client.ts';
import { notes, type NewNote, type Note } from './schema.ts';

type SearchResult = Note & { distance: number };

export const parseTags = (raw: string): string[] => {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
};

export const serializeTags = (tags: string[]): string => JSON.stringify(tags);

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

const RRF_K = 60;

const buildRrf = () => {
  const scores = new Map<number, number>();
  const cache = new Map<number, Note>();

  const add = (items: Note[], weight = 1.0) => {
    items.forEach((note, rank) => {
      scores.set(note.id, (scores.get(note.id) ?? 0) + weight / (RRF_K + rank + 1));
      if (!cache.has(note.id)) cache.set(note.id, note);
    });
  };

  const topK = (k: number): SearchResult[] =>
    [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id], rank) => ({ ...cache.get(id)!, distance: rank / k }));

  return { add, topK };
};

export const searchNotes = (
  client: MemexClient,
  query: string,
  embedding: number[],
  limit = 10,
  category?: string,
  tag?: string,
): SearchResult[] => {
  const vec = new Float32Array(embedding);
  const filterArgs = [...(category ? [category] : []), ...(tag ? [tag] : [])];
  const aliasedCategoryFilter = category ? 'AND n.category = ?' : '';
  const aliasedTagFilter = tag ? "AND EXISTS (SELECT 1 FROM json_each(n.tags) WHERE value = ?)" : '';
  const categoryFilter = category ? ' AND category = ?' : '';
  const tagFilter = tag ? " AND EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)" : '';

  const rrf = buildRrf();

  // Source 1: Vector (dense semantic)
  const vectorResults = client.sqlite
    .prepare(
      `SELECT n.*, e.distance
       FROM note_embeddings e
       JOIN notes n ON n.id = e.note_id
       WHERE e.embedding MATCH ?
       AND k = ?
       ${aliasedCategoryFilter}
       ${aliasedTagFilter}
       ORDER BY e.distance`,
    )
    .all(Buffer.from(vec.buffer), limit * 5, ...filterArgs) as SearchResult[];
  rrf.add(vectorResults);

  const normTokens = [...new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2))];

  if (normTokens.length > 0) {
    // Source 2: FTS5 (BM25 over title + content body)
    const ftsTokens = normTokens
      .map((t) => t.replace(/["'*^()\[\]{}\\]/g, '').trim())
      .filter((t) => t.length >= 2);
    if (ftsTokens.length > 0) {
      try {
        const ftsQuery = ftsTokens.map((t) => `"${t}"`).join(' OR ');
        const ftsResults = client.sqlite
          .prepare(
            `SELECT n.*
             FROM notes_fts
             JOIN notes n ON n.id = notes_fts.rowid
             WHERE notes_fts MATCH ?
             ${aliasedCategoryFilter}
             ${aliasedTagFilter}
             ORDER BY bm25(notes_fts)
             LIMIT ?`,
          )
          .all(ftsQuery, ...filterArgs, limit * 3) as Note[];
        rrf.add(ftsResults);
      } catch {
        // FTS5 query invalid or table unavailable — skip this source
      }
    }

    // Source 3: Tag exact match (ordered by number of matching tags)
    const tagPlaceholders = normTokens.map(() => '?').join(', ');
    const tagResults = client.sqlite
      .prepare(
        `SELECT *, (
           SELECT COUNT(*) FROM json_each(tags)
           WHERE lower(value) IN (${tagPlaceholders})
         ) as match_count
         FROM notes
         WHERE EXISTS (
           SELECT 1 FROM json_each(tags)
           WHERE lower(value) IN (${tagPlaceholders})
         )
         ${categoryFilter}${tagFilter}
         ORDER BY match_count DESC
         LIMIT ?`,
      )
      .all(...normTokens, ...normTokens, ...filterArgs, limit * 3) as Note[];
    rrf.add(tagResults);

    // Source 4: Title keyword match (2× weight — strongest exact-match signal)
    const titleConditions = normTokens.map(() => 'lower(title) LIKE ?').join(' AND ');
    const titleResults = client.sqlite
      .prepare(
        `SELECT * FROM notes WHERE ${titleConditions}${categoryFilter}${tagFilter} LIMIT ?`,
      )
      .all(...normTokens.map((t) => `%${t}%`), ...filterArgs, limit) as Note[];
    rrf.add(titleResults, 2.0);
  }

  return rrf.topK(limit);
};

export const listNotes = (client: MemexClient, limit = 20): Note[] =>
  client.db.select().from(notes).orderBy(desc(notes.createdAt)).limit(limit).all();

export const countNotes = (client: MemexClient): number =>
  (client.sqlite.prepare('SELECT COUNT(*) as n FROM notes').get() as { n: number }).n;

export const getNote = (client: MemexClient, id: number): Note | undefined =>
  client.db.select().from(notes).where(eq(notes.id, id)).get();

export const getNoteByFilePath = (client: MemexClient, filePath: string): Note | undefined =>
  client.db.select().from(notes).where(eq(notes.filePath, filePath)).get();

export const listNotesByPathPrefix = (client: MemexClient, prefix: string): Note[] =>
  client.db.select().from(notes).where(like(notes.filePath, `${prefix}%`)).all();

export const deleteNote = (client: MemexClient, id: number): void => {
  client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(id));
  client.db.delete(notes).where(eq(notes.id, id)).run();
};

export const updateNote = (
  client: MemexClient,
  id: number,
  patch: Partial<Pick<NewNote, 'title' | 'content' | 'category' | 'tags'>>,
): Note => {
  const [updated] = client.db
    .update(notes)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return updated;
};

export type RelatedNote = Note & { sharedTags: string[]; score: number };

export const findRelatedNotes = (
  client: MemexClient,
  noteId: number,
  limit = 10,
): RelatedNote[] => {
  const embRow = client.sqlite
    .prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?')
    .get(BigInt(noteId)) as { embedding: Buffer } | undefined;

  if (!embRow) return [];

  const source = client.db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!source) return [];

  const sourceTags = parseTags(source.tags);

  const candidates = client.sqlite
    .prepare(
      `SELECT n.*, e.distance
       FROM note_embeddings e
       JOIN notes n ON n.id = e.note_id
       WHERE e.embedding MATCH ?
       AND k = ?
       AND n.id != ?
       ORDER BY e.distance`,
    )
    .all(embRow.embedding, limit * 3, noteId) as (Note & { distance: number })[];

  return candidates
    .map((r) => {
      const rTags = parseTags(r.tags);
      const sharedTags = sourceTags.filter((t) => rTags.includes(t));
      // vecScore: 1/(1+d) → [0,1], higher = closer
      const vecScore = 1 / (1 + r.distance);
      const tagScore =
        sourceTags.length + rTags.length > 0
          ? sharedTags.length / Math.max(sourceTags.length, rTags.length)
          : 0;
      const score = 0.7 * vecScore + 0.3 * tagScore;
      return { ...r, sharedTags, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
