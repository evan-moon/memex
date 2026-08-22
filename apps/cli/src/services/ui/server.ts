import { createServer, type IncomingMessage } from 'node:http';
import {
  editNote,
  isEditRejection,
  isSaveRejection,
  type SearchOptions,
  saveNote,
  searchPage,
} from '@memex/core';
import {
  getAmendmentsFor,
  getInference,
  getNote,
  listSignals,
  type MemexClient,
  refreshInferenceStaleness,
  restampInference,
  rewriteInference,
  setInferenceStatus,
  setNoteEvidence,
  setSignalStatus,
} from '@memex/db';
import { writeDerivesFrom } from '@memex/utils';
import { buildDigest } from '../digest.ts';
import { draftStateUpdate } from '../draft.ts';
import { redraftInference } from '../inference-draft.ts';
import { dropTags, listTags, mergeCandidates, renameTags } from '../tidy.ts';
import { buildChores } from './chores.ts';
import {
  bodyOf,
  layerCounts,
  listByLayer,
  noteDetail,
  noteSource,
  noteTitles,
  plainSnippet,
  recompose,
  searchFacets,
  staleStateIds,
} from './notes.ts';
import { buildOverview } from './overview.ts';
import { PAGE } from './page.ts';
import { evidenceBatch } from './repair.ts';
import type { NoteStatus } from './status.ts';
import { buildThread, listThreads } from './threads.ts';
import { buildTopic, buildTopics, topicNotes } from './topics.ts';

type Embedder = (text: string, type?: 'query' | 'passage') => Promise<number[]>;

const DIGEST_DAYS = 7;
const SEARCH_LIMIT = 12;
const SEARCH_LIMIT_MAX = 60;
const TITLE_LIMIT = 5000;
const REPAIR_BATCH = 20;
const REPAIR_BATCH_MAX = 50;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const words = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;

const ids = (value: unknown): number[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isInteger(item))
    ? value
    : undefined;

const positiveInt = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;

const LAYERS = ['past', 'state', 'rule'] as const;
const AUTHORS = ['person', 'agent'] as const;

type Layer = (typeof LAYERS)[number];
type Author = (typeof AUTHORS)[number];

const isLayer = (value: unknown): value is Layer =>
  typeof value === 'string' && LAYERS.some((layer) => layer === value);

const isAuthor = (value: string | null): value is Author =>
  value !== null && AUTHORS.some((author) => author === value);

const day = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const clamp = (value: string | null, fallback: number, max: number): number => {
  const asked = Number(value ?? fallback);
  return Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), max) : fallback;
};

const filtersFrom = (params: URLSearchParams): SearchOptions => {
  const layer = params.get('layer');
  const author = params.get('author');
  return {
    category: params.get('folder') ?? undefined,
    tag: params.get('tag') ?? undefined,
    layer: isLayer(layer) ? layer : undefined,
    author: isAuthor(author) ? author : undefined,
    dateFrom: day(params.get('from')),
    dateTo: day(params.get('to')),
  };
};

export type Reply = { status: number; headers: Record<string, string>; body: string };

const json = (body: unknown): Reply => ({
  status: 200,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

export type ApiErrorCode =
  | 'not-found'
  | 'nothing-to-change'
  | 'empty-title'
  | 'invalid-layer'
  | 'invalid-rename'
  | 'save-rejected'
  | 'inference-archived'
  | 'draft-state-only'
  | 'draft-no-evidence'
  | 'draft-failed'
  | 'draft-no-claude'
  | 'empty-body'
  | 'edit-rejected';

const bad = (status: number, code: ApiErrorCode, detail?: string): Reply => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ error: { code, detail } }),
});

const notFound = bad(404, 'not-found');

export type UiDeps = {
  client: MemexClient;
  embedder: Embedder;
  vaultPath: string;
};

const statusOf = (amendment: { id: number; title: string } | undefined): NoteStatus | null =>
  amendment ? { kind: 'amended', by: { id: amendment.id, title: amendment.title } } : null;

const search = async ({ client, embedder }: UiDeps, params: URLSearchParams) => {
  const limit = clamp(params.get('limit'), SEARCH_LIMIT, SEARCH_LIMIT_MAX);
  const page = await searchPage(client, embedder, params.get('q') ?? '', limit, {
    ...filtersFrom(params),
    surface: 'ui',
  });
  const amendments = getAmendmentsFor(
    client,
    page.results.map((h) => h.id),
  );
  return {
    results: page.results.map((h) => ({
      id: h.id,
      title: h.title,
      layer: h.layer,
      author: h.author,
      at: h.authoredAt ?? h.createdAt,
      snippet: plainSnippet(h.matchSnippet ?? bodyOf(h.content, h.title)).slice(0, 240),
      status: statusOf(amendments.get(h.id)?.at(-1)),
    })),
    collapsed: page.collapsed,
    limit,
  };
};

// The notes a stale_state signal says have piled up since this one was last
// touched — the evidence the draft has to reconcile.
const staleEvidence = (client: MemexClient, id: number) => {
  const signal = listSignals(client, { type: 'stale_state', status: 'new' }).find(
    (s) => s.evidenceIds[0] === id,
  );
  if (!signal) return null;
  const newer = signal.evidenceIds.slice(1).flatMap((noteId) => {
    const note = getNote(client, noteId);
    return note ? [{ id: note.id, title: note.title, body: bodyOf(note.content, note.title) }] : [];
  });
  return { signal, newer };
};

export const route = async (
  deps: UiDeps,
  method: string,
  url: URL,
  payload: unknown,
): Promise<Reply> => {
  const { client, vaultPath } = deps;

  // Every non-API path serves the app, so a deep link like /note/1694 survives
  // a reload instead of 404ing the way a static file server would.
  if (method === 'GET' && !url.pathname.startsWith('/api/')) {
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: PAGE };
  }
  if (method === 'GET' && url.pathname === '/api/sidebar') {
    return json({
      counts: layerCounts(client),
      stale: staleStateIds(client),
      state: listByLayer(client, 'state'),
      rule: listByLayer(client, 'rule'),
    });
  }
  if (method === 'GET' && url.pathname === '/api/digest') {
    const asked = Number(url.searchParams.get('days') ?? DIGEST_DAYS);
    const days = Number.isFinite(asked)
      ? Math.min(Math.max(Math.trunc(asked), 1), 365)
      : DIGEST_DAYS;
    return json(buildDigest(client, { days }));
  }
  if (method === 'GET' && url.pathname === '/api/chores') {
    return json(buildChores(client, vaultPath));
  }
  if (method === 'GET' && url.pathname === '/api/repair/evidence') {
    const limit = clamp(url.searchParams.get('limit'), REPAIR_BATCH, REPAIR_BATCH_MAX);
    return json(evidenceBatch(client, limit));
  }
  if (method === 'GET' && url.pathname === '/api/overview') {
    return json(buildOverview(client));
  }
  if (method === 'GET' && url.pathname === '/api/topics') {
    return json(buildTopics(client));
  }
  if (method === 'GET' && url.pathname === '/api/threads') {
    return json(listThreads(client));
  }
  if (method === 'GET' && url.pathname.startsWith('/api/thread/')) {
    const thread = buildThread(client, Number(url.pathname.split('/').pop()));
    return thread ? json(thread) : notFound;
  }
  if (method === 'GET' && url.pathname.startsWith('/api/topic/')) {
    const tag = decodeURIComponent(url.pathname.slice('/api/topic/'.length));
    const topic = buildTopic(client, tag);
    return topic ? json({ ...topic, notes: topicNotes(client, tag) }) : notFound;
  }
  if (method === 'GET' && url.pathname.startsWith('/api/note/')) {
    const detail = noteDetail(client, Number(url.pathname.split('/').pop()), vaultPath);
    return detail ? json(detail) : notFound;
  }
  if (method === 'GET' && url.pathname.startsWith('/api/source/')) {
    const source = noteSource(client, Number(url.pathname.split('/').pop()));
    return source ? json(source) : notFound;
  }
  if (method === 'GET' && url.pathname === '/api/search') {
    const q = url.searchParams.get('q') ?? '';
    return q.trim().length === 0
      ? json({ results: [], collapsed: [], limit: SEARCH_LIMIT })
      : json(await search(deps, url.searchParams));
  }
  if (method === 'GET' && url.pathname === '/api/titles') {
    return json(noteTitles(client, TITLE_LIMIT));
  }
  if (method === 'GET' && url.pathname === '/api/facets') {
    return json(searchFacets(client));
  }
  if (method === 'GET' && url.pathname === '/api/tag-merges') {
    return json(mergeCandidates(client, vaultPath));
  }
  if (method === 'GET' && url.pathname.startsWith('/api/inference/')) {
    refreshInferenceStaleness(client);
    const found = getInference(client, Number(url.pathname.split('/').pop()));
    return found ? json(found) : notFound;
  }
  if (method === 'GET' && url.pathname === '/api/tags') {
    return json(listTags(client, vaultPath));
  }
  if (method === 'POST' && url.pathname.startsWith('/api/draft/')) {
    const id = Number(url.pathname.split('/').pop());
    const note = getNote(client, id);
    if (!note) return notFound;
    if (note.layer !== 'state') return bad(400, 'draft-state-only');

    const evidence = staleEvidence(client, id);
    if (!evidence || evidence.newer.length === 0) return bad(400, 'draft-no-evidence');

    const draft = await draftStateUpdate({
      title: note.title,
      body: bodyOf(note.content, note.title),
      since: new Date(note.updatedAt).toISOString().slice(0, 10),
      newer: evidence.newer,
    });
    return 'error' in draft
      ? bad(502, draft.code === 'no-claude' ? 'draft-no-claude' : 'draft-failed', draft.error)
      : json(draft);
  }
  if (method === 'POST' && url.pathname.startsWith('/api/inference/')) {
    const [, , , rawId, action] = url.pathname.split('/');
    const inferenceId = Number(rawId);
    const found = getInference(client, inferenceId);
    if (!found) return notFound;
    if (found.inference.status === 'archived') return bad(409, 'inference-archived');

    if (action === 'archive') {
      setInferenceStatus(client, inferenceId, 'archived');
      return json({ ok: true });
    }
    if (action === 'still-true') {
      restampInference(client, inferenceId);
      return json(getInference(client, inferenceId));
    }
    if (action === 'redraft') {
      const notes = found.evidence.flatMap((edge) => {
        const note = getNote(client, edge.noteId);
        return note
          ? [{ id: note.id, title: note.title, body: bodyOf(note.content, note.title) }]
          : [];
      });
      if (notes.length === 0) return bad(400, 'draft-no-evidence');

      const draft = await redraftInference({
        title: found.inference.title,
        summary: found.inference.summary,
        notes,
      });
      return 'error' in draft
        ? bad(502, draft.code === 'no-claude' ? 'draft-no-claude' : 'draft-failed', draft.error)
        : json(draft);
    }
    if (action === 'rewrite') {
      const fields = asRecord(payload);
      const title = text(fields?.title);
      const summary = text(fields?.summary);
      if (!title || !summary) return bad(400, 'nothing-to-change');
      rewriteInference(client, inferenceId, {
        title,
        summary,
        modelId: found.inference.modelId ?? undefined,
      });
      return json(getInference(client, inferenceId));
    }
    if (action === 'promote') {
      // The hypothesis becomes a judgement the person owns, declaring the same
      // primary records. It points at those, never at itself — which is what
      // keeps a synthesis from becoming the input to the next one.
      const sources = found.evidence.filter((edge) => !edge.missing).map((edge) => edge.noteId);
      const result = await saveNote(client, deps.embedder, vaultPath, {
        title: found.inference.title,
        content: found.inference.summary,
        source: 'manual',
        layer: 'state',
        actor: 'user',
      });
      if (isSaveRejection(result)) return bad(409, 'save-rejected', result.message);

      setNoteEvidence(client, result.note.id, sources);
      const note = getNote(client, result.note.id);
      if (note) {
        await editNote(
          deps.client,
          deps.embedder,
          vaultPath,
          result.note.id,
          { content: writeDerivesFrom(note.content, sources) },
          { actor: 'user' },
        );
      }
      setInferenceStatus(client, inferenceId, 'archived');
      return json(noteDetail(client, result.note.id, vaultPath));
    }
    return notFound;
  }
  if (method === 'POST' && url.pathname === '/api/tags/rename') {
    const fields = asRecord(payload);
    const to = text(fields?.to);
    const from = words(fields?.from)?.filter((tag) => tag.trim().length > 0 && tag !== to);
    if (!to || !from || from.length === 0) return bad(400, 'invalid-rename');

    const rename = from.reduce((acc, tag) => acc.set(tag, to), new Map<string, string>());
    return json(renameTags(client, vaultPath, rename));
  }
  if (method === 'POST' && url.pathname === '/api/tags/delete') {
    const tags = words(asRecord(payload)?.tags)?.filter((tag) => tag.trim().length > 0);
    if (!tags || tags.length === 0) return bad(400, 'invalid-rename');
    return json(dropTags(client, vaultPath, tags));
  }
  if (method === 'POST' && url.pathname === '/api/notes') {
    const fields = asRecord(payload);
    const title = text(fields?.title);
    const content = text(fields?.content);
    const layer = fields?.layer;
    if (!title) return bad(400, 'empty-title');
    if (!content) return bad(400, 'empty-body');
    if (!isLayer(layer)) return bad(400, 'invalid-layer');

    const result = await saveNote(client, deps.embedder, vaultPath, {
      title,
      content,
      source: 'manual',
      layer,
      folder: text(fields?.folder),
      tags: words(fields?.tags),
      amends: positiveInt(fields?.amends),
      actor: 'user',
    });
    if (isSaveRejection(result)) return bad(409, 'save-rejected', result.message);
    return json(noteDetail(client, result.note.id, vaultPath));
  }
  if (method === 'POST' && url.pathname.startsWith('/api/note/')) {
    const noteId = Number(url.pathname.split('/').pop());
    const note = getNote(client, noteId);
    if (!note) return notFound;

    const fields = asRecord(payload);
    const body = fields && 'body' in fields ? fields.body : undefined;
    if (body !== undefined && text(body) === undefined) return bad(400, 'empty-body');
    if (fields && 'title' in fields && text(fields.title) === undefined) {
      return bad(400, 'empty-title');
    }
    if (fields && 'layer' in fields && !isLayer(fields.layer)) return bad(400, 'invalid-layer');

    const declared = ids(fields?.derivesFrom);
    const patch = {
      title: text(fields?.title),
      content: (() => {
        const withBody =
          typeof body === 'string' ? recompose(note.content, body, note.title) : undefined;
        if (declared === undefined) return withBody;
        return writeDerivesFrom(withBody ?? note.content, declared);
      })(),
      tags: words(fields?.tags),
      layer: isLayer(fields?.layer) ? fields?.layer : undefined,
    };
    if (Object.values(patch).every((value) => value === undefined)) {
      return bad(400, 'nothing-to-change');
    }

    const result = await editNote(deps.client, deps.embedder, vaultPath, noteId, patch, {
      actor: 'user',
    });
    if (result === null) return notFound;
    if (isEditRejection(result)) return bad(409, 'edit-rejected', result.message);

    // The reason the signal existed is gone, so it goes with it — leaving it
    // 'new' would put the warning back on a note that was just reconciled.
    if (declared !== undefined) setNoteEvidence(client, noteId, declared);

    const evidence = patch.content === undefined ? null : staleEvidence(client, noteId);
    if (evidence) setSignalStatus(client, evidence.signal.id, 'minted');
    return json(noteDetail(client, noteId, vaultPath));
  }
  if (method === 'POST' && url.pathname.startsWith('/api/still-true/')) {
    const id = Number(url.pathname.split('/').pop());

    // For a projection that names its sources this is not dismissing a hunch —
    // it is saying the sources have been read as they stand, so the comparison
    // starts again from here.
    const declaredIds = (
      client.sqlite.prepare('SELECT source_id FROM note_evidence WHERE note_id = ?').all(id) as {
        source_id: number;
      }[]
    ).map((row) => row.source_id);
    if (declaredIds.length > 0) {
      setNoteEvidence(client, id, declaredIds);
      return json({ ok: true });
    }

    const evidence = staleEvidence(client, id);
    if (!evidence) return notFound;
    setSignalStatus(client, evidence.signal.id, 'dismissed');
    return json({ ok: true });
  }
  return notFound;
};

const readJson = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
  });

// Binding to loopback keeps other machines out, but not other pages on this
// one: any site the browser visits can POST to 127.0.0.1. Reads were harmless;
// writes are not. A same-origin check costs nothing and closes it.
const sameOrigin = (origin: string | undefined, host: string | undefined) => {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

export const startUiServer = (deps: UiDeps, port: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const method = req.method ?? 'GET';

      if (method !== 'GET' && !sameOrigin(req.headers.origin, req.headers.host)) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('cross-origin write refused');
        return;
      }

      (method === 'GET' ? Promise.resolve(null) : readJson(req))
        .then((payload) => route(deps, method, url, payload))
        .then(({ status, headers, body }) => {
          res.writeHead(status, headers);
          res.end(body);
        })
        .catch((error: unknown) => {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end(error instanceof Error ? error.message : 'error');
        });
    });
    // Loopback only: this serves a personal vault and has no auth.
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${port}`));
  });
