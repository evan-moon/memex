import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  searchNotes as dbSearchNotes,
  deleteNote,
  type Flashback,
  type FlashbackOptions,
  findFlashbacks,
  findSimilarByEmbedding,
  getNote,
  insertNote,
  isNoteType,
  linkAmendment,
  logRetrieval,
  type MemexClient,
  type Note,
  type NoteAuthor,
  type NoteLayer,
  type NoteSource,
  type NoteType,
  parseAuthoredAt,
  parseTags,
  proactiveSignalFor,
  type RetrievalSurface,
  RRF_K,
  type RuleStatus,
  type SearchResult,
  type Signal,
  type SimilarNote,
  serializeTags,
  setNoteInvalidations,
  syncLinks,
  syncNoteFacets,
  updateNote,
} from '@memex/db';
import {
  buildEmbeddingText,
  collapseSeries,
  extractCategory,
  inVault,
  noteProse,
  sanitizeFilename,
  sanitizeFolder,
  writeInvalidates,
} from '@memex/utils';
import { missingSlots } from './slots.ts';
import { indexNoteVectors } from './vectors.ts';

type Embedder = (text: string, type?: 'query' | 'passage') => Promise<number[]>;

const yamlString = (value: string): string =>
  /[:#[\]{}&*!|>'"%@`,]|^\s|\s$/.test(value)
    ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : value;

const generateFilePath = (vaultPath: string, title: string, folder?: string): string => {
  const safeFolder = folder === undefined ? '' : sanitizeFolder(folder);
  const dir = safeFolder === '' ? vaultPath : join(vaultPath, safeFolder);
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
  /** Only a rule note carries one. Null on every other layer, and on a rule the
   * agent's proposal has yet to be approved into. */
  ruleStatus: RuleStatus | null;
  /** Effective date written to frontmatter: authoredAt when known, else now. */
  date: number;
};

type OwnedField = {
  key: string;
  value: string | null;
  /** Whether the field may be added to frontmatter that does not have it. Off
   * unless a rebuild would get the note wrong without it, because a file memex
   * did not author keeps the shape it arrived in. */
  insert: boolean;
};

const syncedField = (frontmatter: string, { key, value, insert }: OwnedField): string => {
  const lines = frontmatter.split('\n');
  const at = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (at === -1) {
    return value === null || !insert ? frontmatter : [...lines, `${key}: ${value}`].join('\n');
  }
  const rest = value === null ? lines.slice(at + 1) : [`${key}: ${value}`, ...lines.slice(at + 1)];
  return [...lines.slice(0, at), ...rest].join('\n');
};

// A note file has one of three shapes, and a write must not corrupt the two
// shapes that originate outside memex (the contract: a file memex did not
// author keeps the shape it arrived in and re-indexes without drift):
// - frontmatter file (indexed from an external vault): the DB content IS the
//   full file, frontmatter included — write it back verbatim, syncing only the
//   fields memex owns (`title`, `layer`, `rule_status`) so an edit to one of
//   them survives the next reindex.
// - H1 file (indexed, or a memex note that came back through `memex index`):
//   the content already carries its heading — rewrite the first H1 instead of
//   prepending a second one, and don't force frontmatter onto a file the user
//   shaped themselves.
// - memex-native content: generate frontmatter (title/date/tags/layer) so the
//   note's metadata survives a `memex index` round-trip instead of living
//   only in the DB.
export const renderNoteFile = ({
  title,
  content,
  tags,
  layer,
  ruleStatus,
  date,
}: NoteFileMeta): string => {
  // What a rebuild from these files alone would get wrong, and so what a file
  // has to say out loud however it is shaped. `past` is the column default, so
  // a past note comes back right saying nothing; state, rule, and whether a rule
  // is in effect do not.
  const atRisk = layer !== 'past' || ruleStatus !== null;

  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1 && /^title:/m.test(content.slice(3, end))) {
      const owned: OwnedField[] = [
        { key: 'title', value: yamlString(title), insert: false },
        { key: 'layer', value: layer, insert: atRisk },
        { key: 'rule_status', value: ruleStatus, insert: ruleStatus !== null },
      ];
      const synced = owned.reduce(syncedField, content.slice(0, end));
      return synced + content.slice(end);
    }
    return content;
  }
  if (/^#\s/.test(content)) {
    const titled = content.replace(/^#\s.*$/m, `# ${title}`);
    if (!atRisk) return titled;
    // The block carries `title` too, so the next write comes back through the
    // branch above and syncs in place instead of stacking a second header.
    const statusLine = ruleStatus === null ? '' : `\nrule_status: ${ruleStatus}`;
    return `---\ntitle: ${yamlString(title)}\nlayer: ${layer}${statusLine}\n---\n\n${titled}`;
  }
  const isoDate = new Date(date).toISOString().slice(0, 10);
  const tagsLine = tags.length > 0 ? `\ntags: [${tags.join(', ')}]` : '';
  // sanitizeFilename may drop characters the filesystem rejects, which would
  // leave `[[Exact Title]]` pointing at nothing — an alias restores the target.
  const aliasLine = sanitizeFilename(title) === title ? '' : `\naliases: [${yamlString(title)}]`;
  // Whether a rule is in effect is the note's own business, not the database's:
  // a DB rebuilt from these files has to be able to tell an approved rule from
  // a proposal, and only the file survives that.
  const statusLine = ruleStatus === null ? '' : `\nrule_status: ${ruleStatus}`;
  return `---\ntitle: ${yamlString(title)}\ndate: ${isoDate}${tagsLine}${aliasLine}\nlayer: ${layer}${statusLine}\n---\n\n# ${title}\n\n${content}`;
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

const slotsMissingMessage = (type: NoteType, missing: string[]): string =>
  `Not saved. A "${type}" note carries a fixed set of sections, and these are missing:\n${missing
    .map((slot) => `## ${slot}`)
    .join('\n')}\n\nWrite each one with what this conversation actually settled, then save again.`;

export type RuleWriteRejection =
  | { error: 'RULE_USER_ONLY'; message: string }
  | { error: 'EXTERNAL_SOURCE'; message: string }
  | { error: 'SLOTS_MISSING'; message: string; missingSlots: string[] }
  | { error: 'EMPTY_BODY'; message: string };

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
    amendKind?: 'corrects' | 'continues';
    invalidates?: string[];
    type: NoteType;
  },
): Promise<
  | {
      note: Note;
      similar: SimilarNote[];
      flashbacks: Flashback[];
      signal?: Signal;
      amended?: Note;
      amendsMissing?: number;
      invalidates?: string[];
    }
  | RuleWriteRejection
> => {
  // Rule notes become SERVER_INSTRUCTIONS on the next startup, so a rule the
  // agent wrote would be read back to the agent that writes the next one. The
  // proposal is kept; it is the injection that waits for a person to approve it.
  const ruleStatus =
    params.layer === 'rule' ? (params.actor === 'user' ? 'canonical' : 'provisional') : null;

  if (noteProse(params.content).length === 0) {
    return {
      error: 'EMPTY_BODY',
      message:
        `"${params.title}" has a title and nothing under it. A note nobody can read is a ` +
        'filename the search will keep returning. Write what happened, or leave it out.',
    };
  }

  // The template is a contract with the agent, not with the person. An agent
  // writing into the vault is filling a record it will have to read back, and
  // the sections are what make that readable. A person writing the same note is
  // correcting something the agent got wrong, and a form to fill in is the
  // surest way to make them not bother.
  const missing = params.actor === 'user' ? [] : missingSlots(params.type, params.content);
  if (missing.length > 0) {
    return {
      error: 'SLOTS_MISSING',
      message: slotsMissingMessage(params.type, missing),
      missingSlots: missing,
    };
  }

  const embedding = await embedder(
    buildEmbeddingText(params.title, params.content, params.folder, params.tags),
  );
  const similar = findSimilarByEmbedding(client, embedding, 0.5, 3);

  const authoredAt = parseAuthoredAt(params.title, params.content) ?? undefined;

  const invalidates = (params.invalidates ?? [])
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 0);

  const filePath = generateFilePath(vaultPath, params.title, params.folder);
  writeFileSync(
    filePath,
    writeInvalidates(
      renderNoteFile({
        title: params.title,
        content: params.content,
        tags: params.tags ?? [],
        layer: params.layer,
        ruleStatus,
        date: authoredAt ?? Date.now(),
      }),
      invalidates,
    ),
    'utf8',
  );

  const category = extractCategory(params.folder);
  const tags = serializeTags(params.tags ?? []);
  const {
    actor: _actor,
    amends: _amends,
    amendKind: _amendKind,
    invalidates: _invalidates,
    ...noteParams
  } = params;
  const note = insertNote(client, {
    ...noteParams,
    filePath,
    category: category ?? undefined,
    tags,
    authoredAt,
    ruleStatus,
  });
  await indexNoteVectors(
    client,
    embedder,
    note.id,
    { title: params.title, content: params.content, folder: params.folder, tags: params.tags },
    embedding,
  );
  syncLinks(client, note.id, params.content);
  syncNoteFacets(client, note.id);

  if (invalidates.length > 0) setNoteInvalidations(client, note.id, invalidates);

  const amended = params.amends === undefined ? undefined : getNote(client, params.amends);
  // Default `continues`, not `corrects`: the safe half of the claim. Saying a
  // note is wrong when nobody said so is the failure this split exists to end.
  // Naming what is no longer true is that saying, so it settles the kind.
  const amendKind = params.amendKind ?? (invalidates.length > 0 ? 'corrects' : 'continues');
  if (amended) linkAmendment(client, note.id, amended.id, amendKind);

  const flashbacks = findFlashbacks(client, note.id, Date.now(), readFlashbackOptions());
  persistFlashbackLinks(client, note.id, flashbacks);

  // Proactive surfacing: the detectors that can answer for a single note run
  // here; the corpus-wide sweeps are left to the next read, which the change
  // log now wakes on its own. A save used to pay 363ms of detection to find
  // one hint about the note it had just written.
  const signal = proactiveSignalFor(client, note.id);

  return {
    note,
    similar,
    flashbacks,
    signal,
    ...(amended ? { amended } : {}),
    ...(params.amends !== undefined && !amended ? { amendsMissing: params.amends } : {}),
    ...(invalidates.length > 0 ? { invalidates } : {}),
  };
};

export type Reranker = (query: string, passages: string[]) => Promise<number[]>;

export type SearchOptions = {
  category?: string;
  tag?: string;
  layer?: NoteLayer;
  author?: NoteAuthor;
  dateFrom?: number;
  dateTo?: number;
  reranker?: Reranker;
  /** Cap results from one dated series. 0 keeps every member. */
  seriesCap?: number;
  /** Rows to fetch before re-ordering. Widens the page without retuning the arms. */
  rows?: number;
  /** Where the query came from. Set it to record the page in `retrieval_log`. */
  surface?: RetrievalSurface;
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

const recordPage = (
  client: MemexClient,
  query: string,
  surface: RetrievalSurface | undefined,
  page: SearchPage,
): SearchPage => {
  if (surface) logRetrieval(client, { query, surface, noteIds: page.results.map((r) => r.id) });
  return page;
};

export const searchPage = async (
  client: MemexClient,
  embedder: Embedder,
  query: string,
  limit: number,
  options: SearchOptions = {},
): Promise<SearchPage> => {
  const { reranker, category, tag, layer, author, dateFrom, dateTo, surface } = options;
  const embedding = await embedder(query, 'query');
  const candidates = dbSearchNotes(client, query, embedding, limit, {
    category,
    tag,
    layer,
    author,
    dateFrom,
    dateTo,
    rows: fetchSize(limit, options),
  });
  const ranked = reranker
    ? await applyRerank(reranker, query, candidates, candidates.length)
    : candidates;
  const cap = capOf(options);
  const page =
    cap <= 0
      ? { results: ranked.slice(0, limit), collapsed: [] }
      : collapseSeries(ranked, limit, cap);
  return recordPage(client, query, surface, page);
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
  const { reranker, surface, ...filters } = options;
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

  const page =
    cap <= 0
      ? { results: ranked.slice(0, limit), collapsed: [] }
      : collapseSeries(ranked, limit, cap);
  return recordPage(client, queries.join(' | '), surface, page);
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
  | { error: 'RULE_USER_ONLY'; message: string }
  | { error: 'SLOTS_MISSING'; message: string; missingSlots: string[] }
  | { error: 'EMPTY_BODY'; message: string }
  | {
      error: 'EXTERNAL_SOURCE';
      message: string;
      suggestion: {
        action: 'save_note';
        title: string;
        link: string;
        layer: NoteLayer;
        derivesFrom: number[];
      };
    };

// What to do with a borrowed note instead of editing it: say something about
// it in a note memex owns, and name it as the source.
export const referenceSuggestion = (note: { id: number; title: string }) => ({
  action: 'save_note' as const,
  title: `${note.title} — what I make of it`,
  link: `[[${note.title}]]`,
  layer: 'state' as const,
  derivesFrom: [note.id],
});

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

  // The next `memex index` reads this file again and overwrites whatever was
  // written here, so an edit that appears to work is the worst outcome.
  if (!inVault(note.filePath, vaultPath)) {
    return {
      error: 'EXTERNAL_SOURCE',
      message:
        `#${id} lives outside the vault, in ${dirname(note.filePath)}. memex indexes that ` +
        'directory but does not own it: an edit here is undone by the next index, and the ' +
        'tool that wrote the file never sees it. Write a note about it instead.',
      suggestion: referenceSuggestion(note),
    };
  }

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

  // Sections the agent had to write to save the note are sections it must not
  // edit back out. Without this the contract holds for exactly one write.
  if (patch.content !== undefined) {
    if (noteProse(patch.content).length === 0) {
      return {
        error: 'EMPTY_BODY',
        message: `An edit that empties #${id} leaves a filename behind. Delete it instead.`,
      };
    }
    if (options.actor !== 'user' && isNoteType(note.type)) {
      const missing = missingSlots(note.type, patch.content);
      if (missing.length > 0) {
        return {
          error: 'SLOTS_MISSING',
          message: slotsMissingMessage(note.type, missing),
          missingSlots: missing,
        };
      }
    }
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
      ruleStatus: updated.ruleStatus,
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
  syncNoteFacets(client, id);

  const signal = proactiveSignalFor(client, id);

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
  options: { actor?: WriteActor; vaultPath?: string } = {},
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

  // Deleting an indexed note unlinks the file it was read from, and outside the
  // vault that file is the original: a blog post, a repo doc. Forgetting a
  // borrowed note has to mean dropping the index entry, never the source.
  if (options.vaultPath !== undefined && !inVault(filePath, options.vaultPath)) {
    return {
      error: 'EXTERNAL_SOURCE',
      message:
        `#${id} was indexed from ${dirname(filePath)}, outside the vault. Deleting it here ` +
        'would delete the original file. Remove the directory with `memex source` instead, ' +
        'or delete the file where it lives.',
    };
  }

  if (existsSync(filePath)) unlinkSync(filePath);
  deleteNote(client, id);
  return undefined;
};
