import { createServer } from 'node:http';
import { getNote, type MemexClient, type SignalStatus } from '@memex/db';
import { buildInbox, triageSignal } from './inbox.ts';
import { PAGE } from './page.ts';

const json = (body: unknown) => ({
  status: 200,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const notFound = { status: 404, headers: { 'content-type': 'text/plain' }, body: 'not found' };

const TRIAGE: SignalStatus[] = ['dismissed', 'snoozed', 'minted'];

const route = (client: MemexClient, method: string, url: URL, body: string) => {
  if (method === 'GET' && url.pathname === '/') {
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: PAGE };
  }
  if (method === 'GET' && url.pathname === '/api/inbox') {
    return json(buildInbox(client, url.searchParams.get('maintenance') === '1'));
  }
  if (method === 'GET' && url.pathname.startsWith('/api/note/')) {
    const note = getNote(client, Number(url.pathname.split('/').pop()));
    return note ? json(note) : notFound;
  }
  if (method === 'POST' && url.pathname.startsWith('/api/signal/')) {
    const id = Number(url.pathname.split('/')[3]);
    const status = (JSON.parse(body || '{}') as { status?: string }).status;
    if (!status || !TRIAGE.includes(status as SignalStatus)) {
      return { status: 400, headers: { 'content-type': 'text/plain' }, body: 'bad status' };
    }
    const signal = triageSignal(client, id, status as SignalStatus);
    return signal ? json(signal) : notFound;
  }
  return notFound;
};

export const startUiServer = (client: MemexClient, port: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        try {
          const { status, headers, body } = route(
            client,
            req.method ?? 'GET',
            url,
            Buffer.concat(chunks).toString('utf8'),
          );
          res.writeHead(status, headers);
          res.end(body);
        } catch (error) {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end(error instanceof Error ? error.message : 'error');
        }
      });
    });
    // Loopback only: the DB holds a personal vault and this has no auth.
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${port}`));
  });
