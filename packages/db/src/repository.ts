import { desc, eq, gte, like } from 'drizzle-orm';
import type { MemexClient } from './client.ts';
import { type NewNote, type Note, notes } from './schema.ts';

export type SearchResult = Note & { distance: number; matchSnippet?: string };

type Candidate = Note & { matchSnippet?: string; distance?: number; chunkExcerpt?: string };

export const parseTags = (raw: string): string[] => {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
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

// vec0 rejects INSERT OR REPLACE on its primary key, so re-embedding a note is
// a delete followed by an insert. Doing it here keeps every caller from having
// to remember, and makes a second save of the same note a no-op rather than a
// UNIQUE constraint failure.
export const saveEmbedding = (client: MemexClient, noteId: number, embedding: number[]): void => {
  const vec = new Float32Array(embedding);
  const run = client.sqlite.transaction(() => {
    client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(noteId));
    client.sqlite
      .prepare('INSERT INTO note_embeddings(note_id, embedding) VALUES (?, ?)')
      .run(BigInt(noteId), Buffer.from(vec.buffer));
  });
  run();
};

export type EmbeddedChunk = {
  ord: number;
  heading: string | null;
  excerpt: string;
  startChar: number;
  endChar: number;
  embedding: number[];
};

export const deleteNoteChunks = (client: MemexClient, noteId: number): void => {
  const ids = client.sqlite.prepare('SELECT id FROM note_chunks WHERE note_id = ?').all(noteId) as {
    id: number;
  }[];
  const dropVector = client.sqlite.prepare('DELETE FROM note_chunk_embeddings WHERE chunk_id = ?');
  const run = client.sqlite.transaction(() => {
    for (const { id } of ids) dropVector.run(BigInt(id));
    client.sqlite.prepare('DELETE FROM note_chunks WHERE note_id = ?').run(noteId);
  });
  run();
};

export const replaceNoteChunks = (
  client: MemexClient,
  noteId: number,
  chunks: EmbeddedChunk[],
): void => {
  deleteNoteChunks(client, noteId);
  const insertChunk = client.sqlite.prepare(
    `INSERT INTO note_chunks(note_id, ord, heading, excerpt, start_char, end_char)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertVector = client.sqlite.prepare(
    'INSERT INTO note_chunk_embeddings(chunk_id, embedding) VALUES (?, ?)',
  );
  const run = client.sqlite.transaction(() => {
    for (const chunk of chunks) {
      const { lastInsertRowid } = insertChunk.run(
        noteId,
        chunk.ord,
        chunk.heading,
        chunk.excerpt,
        chunk.startChar,
        chunk.endChar,
      );
      const vec = new Float32Array(chunk.embedding);
      insertVector.run(BigInt(lastInsertRowid), Buffer.from(vec.buffer));
    }
  });
  run();
};

export const countChunks = (client: MemexClient): number =>
  (client.sqlite.prepare('SELECT COUNT(*) AS n FROM note_chunks').get() as { n: number }).n;

export const RRF_K = 60;

const CHUNK_POOL = 6;

// Recency tiebreaker (provisional — confirm/tune with `memex eval`): give
// `state`-layer notes (the "current state / plan" layer) a small bump that
// decays with time since last edit, so "what's the current X?" surfaces the
// freshest plan instead of an older draft. Deliberately scoped:
//   - past notes (immutable records) and rule notes get factor 1 → flashback's
//     intentional surfacing of OLD notes is untouched.
//   - multiplicative with a small alpha keeps it a *tiebreaker*: it reorders
//     near-equal candidates but will not overtake a clearly more relevant note.
//   - applied only to the final ranking (topK), never to the link-expansion
//     seeds (topIds), so graph expansion stays relevance-pure.
const STATE_RECENCY_ALPHA = 0.06;
const STATE_RECENCY_TAU_DAYS = 120;

const stateRecencyFactor = (note: Note, now: number): number => {
  if (note.layer !== 'state') return 1;
  const ts = Number(note.updatedAt ?? note.createdAt ?? 0);
  if (!Number.isFinite(ts) || ts <= 0) return 1;
  const ageDays = Math.max(0, (now - ts) / 86_400_000);
  return 1 + STATE_RECENCY_ALPHA * Math.exp(-ageDays / STATE_RECENCY_TAU_DAYS);
};

// Search arms select raw rows (`SELECT *`), so keys arrive snake_case at
// runtime despite the camelCase Note type — normalize once at cache time.
const normalizeCandidate = (row: Candidate): Candidate => {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    filePath: (raw.filePath ?? raw.file_path) as string,
    authoredAt: (raw.authoredAt ?? raw.authored_at ?? null) as number | null,
    createdAt: Number(raw.createdAt ?? raw.created_at),
    updatedAt: Number(raw.updatedAt ?? raw.updated_at),
  };
};

const bestChunkPerNote = (chunks: Candidate[]): Candidate[] => {
  const seen = new Set<number>();
  return chunks
    .filter((chunk) => {
      if (seen.has(chunk.id)) return false;
      seen.add(chunk.id);
      return true;
    })
    .map(({ chunkExcerpt, ...chunk }) => ({
      ...chunk,
      matchSnippet: chunkExcerpt ?? chunk.matchSnippet,
    }));
};

const buildRrf = () => {
  const scores = new Map<number, number>();
  const cache = new Map<number, Candidate>();

  const add = (items: Candidate[], weight = 1.0) => {
    items.forEach((note, rank) => {
      scores.set(note.id, (scores.get(note.id) ?? 0) + weight / (RRF_K + rank + 1));
      const cached = cache.get(note.id);
      if (!cached) cache.set(note.id, normalizeCandidate(note));
      else if (note.matchSnippet && !cached.matchSnippet)
        cache.set(note.id, { ...cached, matchSnippet: note.matchSnippet });
    });
  };

  const topK = (k: number, now: number = Date.now()): SearchResult[] =>
    [...scores.entries()]
      .map(([id, score]) => [id, score * stateRecencyFactor(cache.get(id)!, now)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id]) => {
        const candidate = cache.get(id)!;
        return { ...candidate, distance: candidate.distance ?? Number.POSITIVE_INFINITY };
      });

  // Seeds for link-expansion use the un-adjusted RRF order (relevance-pure).
  const topIds = (k: number): number[] =>
    [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id]) => id);

  return { add, topK, topIds };
};

// `limit` is the page the arms are tuned around — every candidate pool is sized
// from it. `rows` only widens what comes back, so a caller that overfetches to
// re-order results does not silently retune retrieval underneath itself.
export const searchNotes = (
  client: MemexClient,
  query: string,
  embedding: number[],
  limit = 10,
  category?: string,
  tag?: string,
  dateFrom?: number,
  dateTo?: number,
  rows = limit,
): SearchResult[] => {
  const vec = new Float32Array(embedding);
  const filterArgs = [...(category ? [category] : []), ...(tag ? [tag] : [])];
  const aliasedCategoryFilter = category ? 'AND n.category = ?' : '';
  const aliasedTagFilter = tag
    ? 'AND EXISTS (SELECT 1 FROM json_each(n.tags) WHERE value = ?)'
    : '';
  const categoryFilter = category ? ' AND category = ?' : '';
  const tagFilter = tag ? ' AND EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)' : '';
  // Date filters compare the note's effective date: authored_at (real authoring
  // time, parsed from frontmatter/title) when present, created_at (import time)
  // otherwise. Raw created_at would make "notes from April" miss anything
  // imported in May.
  const dateFromFilterAliased = dateFrom ? ' AND COALESCE(n.authored_at, n.created_at) >= ?' : '';
  const dateToFilterAliased = dateTo ? ' AND COALESCE(n.authored_at, n.created_at) <= ?' : '';
  const dateFromFilter = dateFrom ? ' AND COALESCE(authored_at, created_at) >= ?' : '';
  const dateToFilter = dateTo ? ' AND COALESCE(authored_at, created_at) <= ?' : '';
  const dateArgs = [...(dateFrom ? [dateFrom] : []), ...(dateTo ? [dateTo] : [])];

  const rrf = buildRrf();

  // k is applied by the ANN index BEFORE the joined WHERE filters, so a
  // filtered search needs a much larger candidate pool or relevant notes get
  // crowded out by nearer-but-filtered-away ones. Cheap at personal scale.
  const hasFilters = Boolean(category || tag || dateFrom || dateTo);
  const vectorK = hasFilters ? Math.max(limit * 5, 250) : limit * 5;

  const wholeNoteResults = client.sqlite
    .prepare(
      `SELECT n.*, e.distance
       FROM note_embeddings e
       JOIN notes n ON n.id = e.note_id
       WHERE e.embedding MATCH ?
       AND k = ?
       AND NOT EXISTS (SELECT 1 FROM note_chunks c WHERE c.note_id = n.id)
       ${aliasedCategoryFilter}
       ${aliasedTagFilter}
       ${dateFromFilterAliased}
       ${dateToFilterAliased}
       ORDER BY e.distance`,
    )
    .all(Buffer.from(vec.buffer), vectorK, ...filterArgs, ...dateArgs) as SearchResult[];
  rrf.add(wholeNoteResults);

  const chunkK = hasFilters ? Math.max(limit * CHUNK_POOL, 300) : limit * CHUNK_POOL;
  const chunkResults = client.sqlite
    .prepare(
      `SELECT n.*, e.distance, c.excerpt AS chunkExcerpt
       FROM note_chunk_embeddings e
       JOIN note_chunks c ON c.id = e.chunk_id
       JOIN notes n ON n.id = c.note_id
       WHERE e.embedding MATCH ?
       AND k = ?
       ${aliasedCategoryFilter}
       ${aliasedTagFilter}
       ${dateFromFilterAliased}
       ${dateToFilterAliased}
       ORDER BY e.distance`,
    )
    .all(Buffer.from(vec.buffer), chunkK, ...filterArgs, ...dateArgs) as Candidate[];
  rrf.add(bestChunkPerNote(chunkResults));

  const normTokens = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 2),
    ),
  ];

  if (normTokens.length > 0) {
    const ftsTokens = normTokens
      .map((t) => t.replace(/["'*^()[\]{}\\]/g, '').trim())
      .filter((t) => t.length >= 2);
    if (ftsTokens.length > 0) {
      try {
        const ftsQuery = ftsTokens.map((t) => `"${t}"`).join(' OR ');
        const ftsResults = client.sqlite
          .prepare(
            `SELECT n.*, snippet(notes_fts, 1, '', '', '…', 12) AS matchSnippet
             FROM notes_fts
             JOIN notes n ON n.id = notes_fts.rowid
             WHERE notes_fts MATCH ?
             ${aliasedCategoryFilter}
             ${aliasedTagFilter}
             ${dateFromFilterAliased}
             ${dateToFilterAliased}
             ORDER BY bm25(notes_fts)
             LIMIT ?`,
          )
          .all(ftsQuery, ...filterArgs, ...dateArgs, limit * 3) as Candidate[];
        rrf.add(ftsResults);
      } catch {}
    }

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
         ${categoryFilter}${tagFilter}${dateFromFilter}${dateToFilter}
         ORDER BY match_count DESC
         LIMIT ?`,
      )
      .all(...normTokens, ...normTokens, ...filterArgs, ...dateArgs, limit * 3) as Note[];
    rrf.add(tagResults);

    const titleConditions = normTokens.map(() => 'lower(title) LIKE ?').join(' AND ');
    const titleResults = client.sqlite
      .prepare(
        `SELECT * FROM notes WHERE ${titleConditions}${categoryFilter}${tagFilter}${dateFromFilter}${dateToFilter} LIMIT ?`,
      )
      .all(...normTokens.map((t) => `%${t}%`), ...filterArgs, ...dateArgs, limit) as Note[];
    rrf.add(titleResults, 2.0);

    // Substring arm: unicode61 FTS tokenizes Korean by whitespace, so "검색"
    // never matches inside "검색했다" — and a trigram tokenizer can't match the
    // very common 2-char Korean words. A LIKE scan has neither hole, and a
    // full scan is cheap at personal scale. Ranked by distinct tokens matched.
    const likeMatchCount = normTokens
      .map(() => "(lower(content) LIKE '%' || ? || '%')")
      .join(' + ');
    const likeWhere = normTokens.map(() => "lower(content) LIKE '%' || ? || '%'").join(' OR ');
    const substringResults = client.sqlite
      .prepare(
        `SELECT *, (${likeMatchCount}) AS match_count
         FROM notes
         WHERE (${likeWhere})
         ${categoryFilter}${tagFilter}${dateFromFilter}${dateToFilter}
         ORDER BY match_count DESC
         LIMIT ?`,
      )
      .all(...normTokens, ...normTokens, ...filterArgs, ...dateArgs, limit * 3) as Note[];
    rrf.add(substringResults);
  }

  // Link-expansion arm: pull 1-hop note_links neighbours of the current top
  // candidates into the pool at low weight. The link graph (wiki + flashback)
  // encodes curated context that pure text similarity misses — this is the
  // cheapest deterministic slice of the "graph topology" direction.
  const seeds = rrf.topIds(limit);
  if (seeds.length > 0) {
    const ph = seeds.map(() => '?').join(', ');
    const neighbours = client.sqlite
      .prepare(
        `SELECT n.*, COUNT(*) AS hits
         FROM note_links l
         JOIN notes n
           ON n.id = CASE WHEN l.source_id IN (${ph}) THEN l.target_id ELSE l.source_id END
         WHERE (l.source_id IN (${ph}) OR l.target_id IN (${ph}))
           AND n.id NOT IN (${ph})
           ${aliasedCategoryFilter}
           ${aliasedTagFilter}
           ${dateFromFilterAliased}
           ${dateToFilterAliased}
         GROUP BY n.id
         ORDER BY hits DESC
         LIMIT ?`,
      )
      .all(...seeds, ...seeds, ...seeds, ...seeds, ...filterArgs, ...dateArgs, limit * 2) as Note[];
    rrf.add(neighbours, 0.5);
  }

  return rrf.topK(Math.max(limit, rows));
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
  client.db
    .select()
    .from(notes)
    .where(like(notes.filePath, `${prefix}%`))
    .all();

export const deleteNote = (client: MemexClient, id: number): void => {
  deleteNoteChunks(client, id);
  client.sqlite.prepare('DELETE FROM note_embeddings WHERE note_id = ?').run(BigInt(id));
  client.sqlite.prepare('DELETE FROM note_links WHERE source_id = ? OR target_id = ?').run(id, id);
  client.db.delete(notes).where(eq(notes.id, id)).run();
};

export const updateNote = (
  client: MemexClient,
  id: number,
  patch: Partial<Pick<NewNote, 'title' | 'content' | 'category' | 'tags' | 'authoredAt'>>,
): Note => {
  const [updated] = client.db
    .update(notes)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return updated;
};

export type SimilarNote = Note & { distance: number };

export const findSimilarByEmbedding = (
  client: MemexClient,
  embedding: number[],
  threshold = 0.5,
  limit = 3,
  excludeId?: number,
): SimilarNote[] => {
  const vec = new Float32Array(embedding);
  const excludeFilter = excludeId !== undefined ? 'AND n.id != ?' : '';
  const excludeArgs = excludeId !== undefined ? [excludeId] : [];

  const rows = client.sqlite
    .prepare(
      `SELECT n.*, e.distance
       FROM note_embeddings e
       JOIN notes n ON n.id = e.note_id
       WHERE e.embedding MATCH ?
       AND k = ?
       ${excludeFilter}
       AND e.distance < ?
       ORDER BY e.distance`,
    )
    .all(Buffer.from(vec.buffer), limit * 2, ...excludeArgs, threshold) as SimilarNote[];

  return rows.slice(0, limit);
};

export type TagCount = { tag: string; count: number };

export const listAllTags = (client: MemexClient): TagCount[] =>
  client.sqlite
    .prepare(
      `SELECT t.value AS tag, COUNT(*) AS count
       FROM notes n, json_each(n.tags) t
       GROUP BY t.value
       ORDER BY count DESC, t.value ASC`,
    )
    .all() as TagCount[];

export type FolderCount = { folder: string; count: number };

export const listAllFolders = (client: MemexClient): FolderCount[] =>
  client.sqlite
    .prepare(
      `SELECT category AS folder, COUNT(*) AS count
       FROM notes
       WHERE category IS NOT NULL
       GROUP BY category
       ORDER BY count DESC, category ASC`,
    )
    .all() as FolderCount[];

export type RelatedNote = Note & { sharedTags: string[]; score: number };

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export const syncLinks = (client: MemexClient, sourceId: number, content: string) => {
  client.sqlite
    .prepare("DELETE FROM note_links WHERE source_id = ? AND source = 'wiki'")
    .run(sourceId);

  const titles = [...content.matchAll(WIKI_LINK_RE)].map((m) => m[1].trim());
  if (titles.length === 0) return;

  const insert = client.sqlite.prepare(
    "INSERT OR IGNORE INTO note_links(source_id, target_id, source) VALUES (?, ?, 'wiki')",
  );
  const findByTitle = client.sqlite.prepare(
    'SELECT id FROM notes WHERE lower(title) = lower(?) LIMIT 1',
  );

  titles.forEach((title) => {
    const row = findByTitle.get(title) as { id: number } | undefined;
    if (row) insert.run(sourceId, row.id);
  });
};

// A wiki link only works in Obsidian when a note carries that exact title (or
// declares it as an alias), so an unmatched target is a dead link on disk, not
// just a missing row in note_links.
export const findUnresolvedLinks = (client: MemexClient, content: string): string[] => {
  const targets = [
    ...new Set(
      [...content.matchAll(WIKI_LINK_RE)].map((m) =>
        m[1].split('|')[0].split('#')[0].trim().normalize('NFC'),
      ),
    ),
  ].filter(Boolean);
  if (targets.length === 0) return [];

  const findByTitle = client.sqlite.prepare(
    'SELECT id FROM notes WHERE lower(title) = lower(?) LIMIT 1',
  );
  return targets.filter((target) => !findByTitle.get(target));
};

export const getBacklinks = (client: MemexClient, targetId: number): Note[] =>
  client.sqlite
    .prepare(
      `SELECT n.* FROM note_links l
       JOIN notes n ON n.id = l.source_id
       WHERE l.target_id = ?
       ORDER BY n.updated_at DESC`,
    )
    .all(targetId) as Note[];

export const linkAmendment = (
  client: MemexClient,
  amendmentId: number,
  amendedId: number,
): void => {
  client.sqlite
    .prepare(
      "INSERT OR IGNORE INTO note_links(source_id, target_id, source) VALUES (?, ?, 'amends')",
    )
    .run(amendmentId, amendedId);
};

export type Amendment = { id: number; title: string; authoredAt: number };

// Amendments chain: [Amendment 2] usually corrects [Amendment 1], not the
// original, so a note is stale if anything downstream of it corrected it —
// walking one hop would warn about the first correction and hide the last four.
// UNION (not UNION ALL) makes the walk terminate even on a malformed cycle.
const AMENDMENT_CHAIN = `
  WITH RECURSIVE chain(origin, id) AS (
    SELECT l.target_id, l.source_id
    FROM note_links l
    WHERE l.source = 'amends' AND l.target_id IN (SELECT value FROM json_each(?))
    UNION
    SELECT c.origin, l.source_id
    FROM note_links l
    JOIN chain c ON c.id = l.target_id
    WHERE l.source = 'amends'
  )
  SELECT c.origin AS amendedId, n.id, n.title,
         COALESCE(n.authored_at, n.created_at) AS authoredAt
  FROM chain c
  JOIN notes n ON n.id = c.id
  ORDER BY authoredAt, n.id`;

export const getAmendmentsFor = (
  client: MemexClient,
  amendedIds: number[],
): Map<number, Amendment[]> => {
  if (amendedIds.length === 0) return new Map();
  const rows = client.sqlite
    .prepare(AMENDMENT_CHAIN)
    .all(JSON.stringify(amendedIds)) as (Amendment & { amendedId: number })[];
  return rows.reduce((acc, { amendedId, ...amendment }) => {
    acc.set(amendedId, [...(acc.get(amendedId) ?? []), amendment]);
    return acc;
  }, new Map<number, Amendment[]>());
};

export const getAmendments = (client: MemexClient, amendedId: number): Amendment[] =>
  getAmendmentsFor(client, [amendedId]).get(amendedId) ?? [];

export const listNotesSince = (client: MemexClient, sinceMs: number): Note[] =>
  client.db
    .select()
    .from(notes)
    .where(gte(notes.createdAt, sinceMs))
    .orderBy(desc(notes.createdAt))
    .all();

export type Flashback = Note & {
  distance: number;
  daysAgo: number;
};

export type FlashbackOptions = {
  minDaysGap?: number;
  maxDistance?: number;
  limit?: number;
};

export const findFlashbacks = (
  client: MemexClient,
  noteId: number,
  now: number,
  options: FlashbackOptions = {},
): Flashback[] => {
  const minDaysGap = options.minDaysGap ?? 90;
  const maxDistance = options.maxDistance ?? 0.4;
  const limit = options.limit ?? 3;
  const cutoff = now - minDaysGap * 86_400_000;

  const embRow = client.sqlite
    .prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?')
    .get(BigInt(noteId)) as { embedding: Buffer } | undefined;
  if (!embRow) return [];

  const source = client.db.select().from(notes).where(eq(notes.id, noteId)).get();
  const sourceCategory = source?.category ?? null;

  const categoryFilter = sourceCategory ? 'AND (n.category IS NULL OR n.category != ?)' : '';
  const args: (number | Buffer | string)[] = [
    embRow.embedding,
    limit * 5,
    noteId,
    cutoff,
    maxDistance,
  ];
  if (sourceCategory) args.push(sourceCategory);

  const rows = client.sqlite
    .prepare(
      `SELECT n.id, n.title, n.content,
              n.file_path  AS filePath,
              n.category,  n.tags, n.source, n.layer,
              n.authored_at AS authoredAt,
              n.created_at AS createdAt,
              n.updated_at AS updatedAt,
              e.distance
       FROM note_embeddings e
       JOIN notes n ON n.id = e.note_id
       WHERE e.embedding MATCH ?
         AND k = ?
         AND n.id != ?
         AND COALESCE(n.authored_at, n.created_at) < ?
         AND e.distance < ?
         ${categoryFilter}
       ORDER BY e.distance
       LIMIT ${limit}`,
    )
    .all(...args) as (Note & { distance: number })[];

  // The rediscovery gap measures distance from when the thought was written,
  // not when it was imported — otherwise a freshly imported vault stays
  // flashback-silent for minDaysGap days.
  return rows.map((r) => ({
    ...r,
    daysAgo: Math.floor((now - (r.authoredAt ?? r.createdAt)) / 86_400_000),
  }));
};

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
