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

export const searchNotes = (
  client: MemexClient,
  query: string,
  embedding: number[],
  limit = 10,
  category?: string,
  tag?: string,
): SearchResult[] => {
  const vec = new Float32Array(embedding);
  const categoryFilter = category ? 'AND n.category = ?' : '';
  const tagFilter = tag ? "AND EXISTS (SELECT 1 FROM json_each(n.tags) WHERE value = ?)" : '';
  const extraArgs = [...(category ? [category] : []), ...(tag ? [tag] : [])];
  const vectorResults = client.sqlite
    .prepare(
      `SELECT n.*, e.distance
       FROM note_embeddings e
       JOIN notes n ON n.id = e.note_id
       WHERE e.embedding MATCH ?
       AND k = ?
       ${categoryFilter}
       ${tagFilter}
       ORDER BY e.distance`,
    )
    .all(Buffer.from(vec.buffer), limit * 5, ...extraArgs) as SearchResult[];

  const normTokens = [...new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2))];

  const seen = new Map<number, SearchResult>();
  for (const r of vectorResults) seen.set(r.id, r);

  if (normTokens.length > 0) {
    const categoryClause = category ? ' AND category = ?' : '';
    const tagClause = tag ? " AND EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)" : '';
    const extraArgs = [...(category ? [category] : []), ...(tag ? [tag] : [])];

    // Pass 1: tag-exact match — order by match_count DESC so multi-tag matches
    // (e.g. "토스" + "면접") surface before single-tag matches (e.g. just "토스")
    const tagPlaceholders = normTokens.map(() => '?').join(', ');
    const tagMatchResults = client.sqlite
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
         ${categoryClause}${tagClause}
         ORDER BY match_count DESC
         LIMIT ?`,
      )
      .all(...normTokens, ...normTokens, ...extraArgs, limit * 3) as Note[];

    for (const r of tagMatchResults) {
      const tagsArr = parseTags(r.tags);
      const matchingTags = normTokens.filter((t) => tagsArr.some((tag) => tag.toLowerCase() === t));
      const score = matchingTags.length >= 2 ? 0.05 : 0.10;
      if (!seen.has(r.id) || seen.get(r.id)!.distance > score) {
        seen.set(r.id, { ...r, distance: score });
      }
    }

    // Pass 2: title keyword match (AND — precise)
    const titleConditions = normTokens.map(() => 'lower(title) LIKE ?').join(' AND ');
    const titleResults = client.sqlite
      .prepare(`SELECT * FROM notes WHERE ${titleConditions}${categoryClause}${tagClause} LIMIT ?`)
      .all(...normTokens.map((t) => `%${t}%`), ...extraArgs, limit) as Note[];

    for (const r of titleResults) {
      if (!seen.has(r.id) || seen.get(r.id)!.distance > 0.01) {
        seen.set(r.id, { ...r, distance: 0.01 });
      }
    }
  }

  return [...seen.values()].sort((a, b) => a.distance - b.distance).slice(0, limit);
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
