import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEME, serve } from './serve.ts';

let root: string;
let dbDir: string;
let client: MemexClient;
let handle: (request: Request) => Promise<Response>;
let deps: Parameters<typeof serve>[0];

const at = (path: string, init?: RequestInit) =>
  handle(new Request(`${SCHEME}://app${path}`, init));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'memex-renderer-'));
  dbDir = mkdtempSync(join(tmpdir(), 'memex-serve-'));
  client = openDb(dbDir);

  writeFileSync(join(root, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets/app.js'), 'console.log(1)', 'utf8');
  writeFileSync(join(root, 'assets/app.css'), 'body{}', 'utf8');

  deps = {
    client,
    embedder: async () => new Array(768).fill(0),
    vaultPath: dbDir,
    mcp: { home: dbDir, serverPath: '/repo/apps/mcp/dist/index.js' },
    pathEnv: '',
    openUrl: () => {},
    model: {
      read: () => ({ kind: 'ready' as const }),
      start: () => ({ kind: 'ready' as const }),
      embed: async () => new Array(768).fill(0),
    },
  };
  handle = serve(deps, root);
});

const serveWith = (devServer: string) => serve(deps, root, devServer);

afterEach(() => {
  client.sqlite.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(dbDir, { recursive: true, force: true });
});

describe('serving the app', () => {
  it('hands back the page itself', async () => {
    const res = await at('/');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('id="root"');
  });

  it('types the assets by their extension rather than guessing', async () => {
    expect((await at('/assets/app.js')).headers.get('content-type')).toContain('text/javascript');
    expect((await at('/assets/app.css')).headers.get('content-type')).toContain('text/css');
  });

  // A deep link is not a missing file. Reloading on /note/1694 has to come back
  // with the page, the way it did when a server answered every path.
  it('answers a route the page knows about with the page', async () => {
    const res = await at('/note/1694');

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
  });

  // The page decides which path is read, so the guard has to be here. `..` in a
  // plain path is normalised away by URL before the handler ever sees it —
  // percent-encoding it is what survives that far, which is what this reads.
  it('refuses to read its way out of the renderer directory', async () => {
    const outside = join(root, '..', 'memex-serve-secret.txt');
    writeFileSync(outside, 'a-real-secret', 'utf8');

    try {
      const res = await at('/..%2Fmemex-serve-secret.txt');

      expect(await res.text()).not.toContain('a-real-secret');
    } finally {
      rmSync(outside, { force: true });
    }
  });
});

describe('serving the API', () => {
  it('routes a GET and answers with what the route returned', async () => {
    const res = await at('/api/sidebar');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('counts');
  });

  it('carries the query string through', async () => {
    const res = await at('/api/digest?days=7');

    expect(res.status).toBe(200);
  });

  it('carries a POST body through', async () => {
    const res = await at('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });

    // An empty message is refused by the route, which is the proof the body
    // arrived: without it the route would not have got as far as reading one.
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('empty-message');
  });

  it('passes a status the route chose, not always 200', async () => {
    const res = await at('/api/note/999999');

    expect(res.status).toBe(404);
  });
});

describe('serving the app while it is being worked on', () => {
  let stand: Server;
  let devServer: string;

  beforeEach(async () => {
    stand = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`from vite: ${req.url}`);
    });
    await new Promise<void>((resolve) => stand.listen(0, '127.0.0.1', resolve));
    const bound = stand.address();
    devServer = `http://127.0.0.1:${typeof bound === 'object' && bound ? bound.port : 0}`;
  });

  afterEach(() => stand.close());

  it('asks the dev server for the page instead of reading it off disk', async () => {
    const handle = serveWith(devServer);

    const res = await handle(new Request(`${SCHEME}://app/src/App.tsx`));

    expect(await res.text()).toBe('from vite: /src/App.tsx');
  });

  // The whole point of keeping the window on memex:// in development is that
  // the API goes the same way it does in a packaged build.
  it('still answers the API itself', async () => {
    const handle = serveWith(devServer);

    const res = await handle(new Request(`${SCHEME}://app/api/sidebar`));

    expect(await res.json()).toHaveProperty('counts');
  });
});
