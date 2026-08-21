import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  searchNotes as dbSearchNotes,
  deleteNote,
  type Flashback,
  type FlashbackOptions,
  findBestProactiveSignal,
  findFlashbacks,
  findSimilarByEmbedding,
  getNote,
  insertNote,
  linkAmendment,
  type MemexClient,
  type Note,
  type NoteLayer,
  type NoteSource,
  parseAuthoredAt,
  parseTags,
  RRF_K,
  refreshSignals,
  type SearchResult,
  type Signal,
  type SimilarNote,
  serializeTags,
  syncLinks,
  updateNote,
} from '@memex/db';
import {
  buildEmbeddingText,
  collapseSeries,
  extractCategory,
  sanitizeFilename,
} from '@memex/utils';
import { indexNoteVectors } from './vectors.ts';

type Embedder = (text: string, type?: 'query' | 'passage') => Promise<number[]>;

const yamlString = (value: string): string =>
  /[:#[\]{}&*!|>'"%@`,]|^\s|\s$/.test(value)
    ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : value;

const generateFilePath = (vaultPath: string, title: string, folder?: string): string => {
  const dir = folder ? join(vaultPath, folder) : vaultPath;
  mkdirSync(dir, { recursive: true });
  const base = sanitizeFilename(title) || 'untitled';
  const first = join(dir, `${base}.md`);
  if (!existsSync(first)) return first;
  for (let n = 2; ; n++) {
    const candidate = join(dir, `${base} (${n}).md`);
    if (!existsSync(candidate)) return candidate;
  }
};

export type NoteFileMeta = {
  title: string;
  content: string;
  tags: string[];
  layer: NoteLayer;
  /** Effective date written to frontmatter: authoredAt when known, else now. */
  date: number;
};

// A note file has one of three shapes, and a write must not corrupt the two
// shapes that originate outside memex (the interop contract: files stay
// editable in Obsidian and re-indexable without drift):
// - frontmatter file (indexed from an external vault): the DB content IS the
//   full file, frontmatter included — write it back verbatim, only syncing the
//   frontmatter `title:` field so a title edit survives the next reindex.
// - H1 file (indexed, or a memex note that came back through `memex index`):
//   the content already carries its heading — rewrite the first H1 instead of
//   prepending a second one, and don't force frontmatter onto a file the user
//   shaped themselves.
// - memex-native content: generate frontmatter (title/date/tags/layer) so the
//   note's metadata survives the Obsidian -> `memex index` round-trip instead
//   of living only in the DB.
export const renderNoteFile = ({ title, content, tags, layer, date }: NoteFileMeta): string => {
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1 && /^title:/m.test(content.slice(3, end))) {
      return (
        content.slice(0, end).replace(/^title:\s*.*$/m, `title: ${yamlString(title)}`) +
        content.slice(end)
      );
    }
    return content;
  }
  if (/^#\s/.test(content)) {
    return content.replace(/^#\s.*$/m, `# ${title}`);
  }
  const isoDate = new Date(date).toISOString().slice(0, 10);
  const tagsLine = tags.length > 0 ? `\ntags: [${tags.join(', ')}]` : '';
  // sanitizeFilename may drop characters the filesystem rejects, which would
  // leave `[[Exact Title]]` pointing at nothing — an alias restores the target.
  const aliasLine = sanitizeFilename(title) === title ? '' : `\naliases: [${yamlString(title)}]`;
  return `---\ntitle: ${yamlString(title)}\ndate: ${isoDate}${tagsLine}${aliasLine}\nlayer: ${layer}\n---\n\n# ${title}\n\n${content}`;
};

const readFlashbackOptions = (): FlashbackOptions => ({
  minDaysGap: process.env.MEMEX_FLASHBACK_DAYS
    ? Number(process.env.MEMEX_FLASHBACK_DAYS)
    : undefined,
  maxDistance: process.env.MEMEX_FLASHBACK_DIST
    ? Number(process.env.MEMEX_FLASHBACK_DIST)
    : undefined,
  limit: process.env.MEMEX_FLASHBACK_LIMIT ? Number(process.env.MEMEX_FLASHBACK_LIMIT) : undefined,
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

/** Who is driving the write. MCP tool handlers are always 'agent'; only the CLI passes 'user'. */
export type WriteActor = 'user' | 'agent';

export type RuleWriteRejection = { error: 'RULE_USER_ONLY'; message: string };

export const isSaveRejection = (
  result: { note: Note } | RuleWriteRejection,
): result is RuleWriteRejection => 'error' in result;

export const saveNote = async (
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
  params: {
    title: string;
    content: string;
    source: NoteSource;
    layer: NoteLayer;
    folder?: string;
    tags?: string[];
    actor?: WriteActor;
    amends?: number;
  },
): Promise<
  | {
      note: Note;
      similar: SimilarNote[];
      flashbacks: Flashback[];
      signal?: Signal;
      amended?: Note;
      amendsMissing?: number;
    }
  | RuleWriteRejection
> => {
  // Rule notes become SERVER_INSTRUCTIONS on the next startup — letting the agent channel write
  // them is a self-poisoning / prompt-injection escalation path, so creation is user-only, like
  // editing. The agent surfaces the proposed rule text instead.
  if (params.layer === 'rule' && params.actor !== 'user') {
    return {
      error: 'RULE_USER_ONLY',
      message:
        'rule notes can only be created by the user. Show the proposed rule text in chat and ' +
        'suggest they run: memex add --layer rule',
    };
  }
  const embedding = await embedder(
    buildEmbeddingText(params.title, params.content, params.folder, params.tags),
  );
  const similar = findSimilarByEmbedding(client, embedding, 0.5, 3);

  const authoredAt = parseAuthoredAt(params.title, params.content) ?? undefined;

  const filePath = generateFilePath(vaultPath, params.title, params.folder);
  writeFileSync(
    filePath,
    renderNoteFile({
      title: params.title,
      content: params.content,
      tags: params.tags ?? [],
      layer: params.layer,
      date: authoredAt ?? Date.now(),
    }),
    'utf8',
  );

  const category = extractCategory(params.folder);
  const tags = serializeTags(params.tags ?? []);
  const { actor: _actor, amends: _amends, ...noteParams } = params;
  const note = insertNote(client, {
    ...noteParams,
    filePath,
    category: category ?? undefined,
    tags,
    authoredAt,
  });
  await indexNoteVectors(
    client,
    embedder,
    note.id,
    { title: params.title, content: params.content, folder: params.folder, tags: params.tags },
    embedding,
  );
  syncLinks(client, note.id, params.content);

  const amended = params.amends === undefined ? undefined : getNote(client, params.amends);
  if (amended) linkAmendment(client, note.id, amended.id);

  const flashbacks = findFlashbacks(client, note.id, Date.now(), readFlashbackOptions());
  persistFlashbackLinks(client, note.id, flashbacks);

  // Proactive surfacing: the write just bumped updated_at, so the dirty-flag
  // lets this refresh run (detection cost is paid on write, keeping reads free).
  // We then surface at most one signal the new note is part of.
  const signals = refreshSignals(client);
  const signal = findBestProactiveSignal(signals, note.id);

  return {
    note,
    similar,
    flashbacks,
    signal,
    ...(amended ? { amended } : {}),
    ...(params.amends !== undefined && !amended ? { amendsMissing: params.amends } : {}),
  };
};

export type Reranker = (query: string, passages: string[]) => Promise<number[]>;

export type SearchOptions = {
  category?: string;
  tag?: string;
  layer?: NoteLayer;
  dateFrom?: number;
  dateTo?: number;
  reranker?: Reranker;
  /** Cap results from one dated series. 0 keeps every member. */
  seriesCap?: number;
  /** Rows to fetch before re-ordering. Widens the page without retuning the arms. */
  rows?: number;
};

export type RankedResult = SearchResult & { rerankScore?: number };

export type SearchPage = {
  results: RankedResult[];
  collapsed: { key: string; label: string; hidden: number }[];
};

const SERIES_CAP = 2;
const SERIES_OVERFETCH = 3;

const RERANK_OVERFETCH = 2;
const RERANK_POOL_MAX = 20;
const RERANK_PASSAGE_CHARS = 1200;

const poolSize = (limit: number, reranker?: Reranker): number =>
  reranker ? Math.min(RERANK_POOL_MAX, limit * RERANK_OVERFETCH) : limit;

const capOf = (options: SearchOptions): number => options.seriesCap ?? SERIES_CAP;

const fetchSize = (limit: number, options: SearchOptions): number =>
  options.rows ??
  (capOf(options) > 0
    ? poolSize(limit * SERIES_OVERFETCH, options.reranker)
    : poolSize(limit, options.reranker));

const rerankPassage = (note: SearchResult): string =>
  `${note.title}\n\n${(note.matchSnippet ?? note.content).slice(0, RERANK_PASSAGE_CHARS)}`;

const applyRerank = async (
  reranker: Reranker,
  query: string,
  candidates: SearchResult[],
  limit: number,
): Promise<RankedResult[]> => {
  if (candidates.length <= 1) return candidates.slice(0, limit);
  const scores = await reranker(query, candidates.map(rerankPassage));
  return candidates
    .map((note, i) => ({ ...note, rerankScore: scores[i] ?? 0 }))
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, limit);
};

export const searchPage = async (
  client: MemexClient,
  embedder: Embedder,
  query: string,
  limit: number,
  options: SearchOptions = {},
): Promise<SearchPage> => {
  const { reranker, category, tag, layer, dateFrom, dateTo } = options;
  const embedding = await embedder(query, 'query');
  const candidates = dbSearchNotes(client, query, embedding, limit, {
    category,
    tag,
    layer,
    dateFrom,
    dateTo,
    rows: fetchSize(limit, options),
  });
  const ranked = reranker
    ? await applyRerank(reranker, query, candidates, candidates.length)
    : candidates;
  const cap = capOf(options);
  if (cap <= 0) return { results: ranked.slice(0, limit), collapsed: [] };
  return collapseSeries(ranked, limit, cap);
};

export const semanticSearch = async (
  client: MemexClient,
  embedder: Embedder,
  query: string,
  limit: number,
  options: SearchOptions = {},
): Promise<RankedResult[]> => (await searchPage(client, embedder, query, limit, options)).results;

export const searchPageMulti = async (
  client: MemexClient,
  embedder: Embedder,
  queries: string[],
  limit: number,
  options: SearchOptions = {},
): Promise<SearchPage> => {
  const { reranker, ...filters } = options;
  const cap = capOf(options);
  const wide = fetchSize(limit, options);
  const perQuery = { ...filters, seriesCap: 0, rows: wide };
  const lists = await Promise.all(
    queries.map((q) => semanticSearch(client, embedder, q, limit, perQuery)),
  );

  const pooled =
    lists.length === 1
      ? lists[0]
      : (() => {
          const scores = new Map<number, number>();
          const cache = new Map<number, SearchResult>();
          lists.forEach((list) => {
            list.forEach((note, rank) => {
              scores.set(note.id, (scores.get(note.id) ?? 0) + 1 / (RRF_K + rank + 1));
              const cached = cache.get(note.id);
              if (!cached) cache.set(note.id, note);
              else if (note.matchSnippet && !cached.matchSnippet)
                cache.set(note.id, { ...cached, matchSnippet: note.matchSnippet });
            });
          });
          return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, wide)
            .map(([id], rank) => {
              const note = cache.get(id);
              if (!note) throw new Error(`Fused note #${id} missing from cache`);
              return { ...note, distance: rank / limit };
            });
        })();

  const ranked = reranker ? await applyRerank(reranker, queries[0], pooled, pooled.length) : pooled;

  if (cap <= 0) return { results: ranked.slice(0, limit), collapsed: [] };
  return collapseSeries(ranked, limit, cap);
};

export const semanticSearchMulti = async (
  client: MemexClient,
  embedder: Embedder,
  queries: string[],
  limit: number,
  options: SearchOptions = {},
): Promise<RankedResult[]> =>
  (await searchPageMulti(client, embedder, queries, limit, options)).results;

export type EditNoteRejection =
  | {
      error: 'PAST_IMMUTABLE';
      message: string;
      suggestion: {
        action: 'save_note';
        title: string;
        link: string;
        layer: NoteLayer;
        amends: number;
      };
    }
  | { error: 'RULE_USER_ONLY'; message: string };

// The shape of a correction, in one place: the rejection an agent gets and the
// form a person fills in have to agree on what an amendment looks like.
export const amendmentSuggestion = (note: { id: number; title: string }) => ({
  action: 'save_note' as const,
  title: `[Amendment] ${note.title}`,
  link: `[[${note.title}]]`,
  layer: 'past' as const,
  amends: note.id,
});

export const editNote = async (
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
  id: number,
  patch: { title?: string; content?: string; tags?: string[]; layer?: NoteLayer },
  options: { actor?: WriteActor } = {},
): Promise<(Note & { signal?: Signal }) | EditNoteRejection | null> => {
  const note = getNote(client, id);
  if (!note) return null;

  if (note.layer === 'past') {
    return {
      error: 'PAST_IMMUTABLE',
      message:
        'past notes are immutable. Save an Amendment note instead, passing amends so ' +
        'search can warn that this note was corrected.',
      suggestion: amendmentSuggestion(note),
    };
  }

  // Editing a rule rewrites a constraint on the agent, and promoting a note
  // into one writes a new constraint from scratch. Both are the same
  // self-modification surface saveNote and removeNote already close.
  if ((note.layer === 'rule' || patch.layer === 'rule') && options.actor !== 'user') {
    return {
      error: 'RULE_USER_ONLY',
      message: 'rule notes can only be edited by the user. Surface your proposed change in chat.',
    };
  }

  const tags = patch.tags !== undefined ? serializeTags(patch.tags) : undefined;
  const updated = updateNote(client, id, { ...patch, tags });
  const title = patch.title ?? note.title;
  const content = patch.content ?? note.content;
  const layer = patch.layer ?? note.layer;
  const resolvedTags = patch.tags ?? parseTags(note.tags);

  writeFileSync(
    updated.filePath,
    renderNoteFile({
      title,
      content,
      tags: resolvedTags,
      layer,
      date: note.authoredAt ?? note.createdAt,
    }),
    'utf8',
  );

  const relDir = relative(vaultPath, dirname(note.filePath));
  const folder = relDir && !relDir.startsWith('..') ? relDir : undefined;
  await indexNoteVectors(client, embedder, id, {
    title,
    content,
    folder,
    tags: resolvedTags,
  });
  syncLinks(client, id, content);

  const signals = refreshSignals(client);
  const signal = findBestProactiveSignal(signals, id);

  return { ...updated, signal };
};

export const isEditRejection = (
  result: Note | EditNoteRejection | null,
): result is EditNoteRejection =>
  result !== null && typeof result === 'object' && 'error' in result;

export const removeNote = (
  client: MemexClient,
  id: number,
  filePath: string,
  options: { actor?: WriteActor } = {},
): RuleWriteRejection | undefined => {
  // Deleting a rule removes a constraint on the agent — the same self-modification surface as
  // creating or editing one, so it is user-only too.
  const note = getNote(client, id);
  if (note?.layer === 'rule' && options.actor !== 'user') {
    return {
      error: 'RULE_USER_ONLY',
      message: `rule notes can only be deleted by the user. Suggest they run: memex delete ${String(id)}`,
    };
  }
  if (existsSync(filePath)) unlinkSync(filePath);
  deleteNote(client, id);
  return undefined;
};
