import { createServer } from 'node:http';
import { semanticSearch } from '@memex/core';
import { getAmendmentsFor, type MemexClient } from '@memex/db';
import { layerCounts, listByLayer, noteDetail, staleStateIds } from './notes.ts';
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

const route = async (deps: UiDeps, method: string, url: URL): Promise<Reply> => {
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
  return notFound;
};

export const startUiServer = (deps: UiDeps, port: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      route(deps, req.method ?? 'GET', url)
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
