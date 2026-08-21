import { createServer, type IncomingMessage } from 'node:http';
import { editNote, isEditRejection, semanticSearch } from '@memex/core';
import {
  getAmendmentsFor,
  getNote,
  listSignals,
  type MemexClient,
  setSignalStatus,
} from '@memex/db';
import { draftStateUpdate } from '../draft.ts';
import { bodyOf, layerCounts, listByLayer, noteDetail, recompose, staleStateIds } from './notes.ts';
import { buildOverview } from './overview.ts';
import { PAGE } from './page.ts';
import { buildTopic, buildTopics, topicNotes } from './topics.ts';

type Embedder = (text: string, type?: 'query' | 'passage') => Promise<number[]>;

type Reply = { status: number; headers: Record<string, string>; body: string };

const json = (body: unknown): Reply => ({
  status: 200,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const bad = (status: number, message: string): Reply => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ error: message }),
});

const notFound: Reply = {
  status: 404,
  headers: { 'content-type': 'text/plain' },
  body: 'not found',
};

export type UiDeps = {
  client: MemexClient;
  embedder: Embedder;
  vaultPath: string;
};

const search = async ({ client, embedder }: UiDeps, query: string) => {
  const hits = await semanticSearch(client, embedder, query, 12);
  const amendments = getAmendmentsFor(
    client,
    hits.map((h) => h.id),
  );
  return hits.map((h) => ({
    id: h.id,
    title: h.title,
    layer: h.layer,
    at: h.authoredAt ?? h.createdAt,
    snippet: (h.matchSnippet ?? h.content).replace(/\s+/g, ' ').slice(0, 240),
    supersededBy: amendments.get(h.id)?.at(-1) ?? null,
  }));
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

const route = async (deps: UiDeps, method: string, url: URL, payload: unknown): Promise<Reply> => {
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
      past: listByLayer(client, 'past'),
    });
  }
  if (method === 'GET' && url.pathname === '/api/overview') {
    return json(buildOverview(client, vaultPath));
  }
  if (method === 'GET' && url.pathname === '/api/topics') {
    return json(buildTopics(client));
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
  if (method === 'GET' && url.pathname === '/api/search') {
    const q = url.searchParams.get('q') ?? '';
    return q.trim().length === 0 ? json([]) : json(await search(deps, q));
  }
  if (method === 'POST' && url.pathname.startsWith('/api/draft/')) {
    const id = Number(url.pathname.split('/').pop());
    const note = getNote(client, id);
    if (!note) return notFound;
    if (note.layer !== 'state') return bad(400, 'state 노트만 갱신 초안을 만들 수 있어.');

    const evidence = staleEvidence(client, id);
    if (!evidence || evidence.newer.length === 0) return bad(400, '갱신할 근거 노트가 없어.');

    const draft = await draftStateUpdate({
      title: note.title,
      body: bodyOf(note.content, note.title),
      since: new Date(note.updatedAt).toISOString().slice(0, 10),
      newer: evidence.newer,
    });
    return 'error' in draft ? bad(502, draft.error) : json(draft);
  }
  if (method === 'POST' && url.pathname.startsWith('/api/note/')) {
    const id = Number(url.pathname.split('/').pop());
    const body = (payload as { body?: string } | null)?.body;
    if (typeof body !== 'string' || body.trim().length === 0) return bad(400, '본문이 비었어.');

    const note = getNote(client, id);
    if (!note) return notFound;

    const result = await editNote(deps.client, deps.embedder, vaultPath, id, {
      content: recompose(note.content, body, note.title),
    });
    if (result === null) return notFound;
    if (isEditRejection(result)) return bad(409, result.message);

    // The reason the signal existed is gone, so it goes with it — leaving it
    // 'new' would put the warning back on a note that was just reconciled.
    const evidence = staleEvidence(client, id);
    if (evidence) setSignalStatus(client, evidence.signal.id, 'minted');
    return json(noteDetail(client, id, vaultPath));
  }
  if (method === 'POST' && url.pathname.startsWith('/api/still-true/')) {
    const id = Number(url.pathname.split('/').pop());
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
