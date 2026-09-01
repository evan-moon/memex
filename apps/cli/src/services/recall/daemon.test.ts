import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { createRecallServer } from './daemon.ts';
import { RECALL_PING, type RecallHit } from './socket.ts';

const hit: RecallHit = { id: 7, title: '한 노트', layer: 'past' };

let dir: string;
let socketPath: string;
let respond: Mock<(query: string) => Promise<RecallHit[]>>;
let server: ReturnType<typeof createRecallServer>;

const listening = (path: string) =>
  new Promise<void>((resolve) => {
    server.listen(path, resolve);
  });

const ask = (query: string) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection(socketPath)
      .on('connect', () => socket.end(query))
      .on('data', (chunk) => chunks.push(chunk))
      .on('error', reject)
      .on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

const dropConnection = () =>
  new Promise<void>((resolve) => {
    const socket = createConnection(socketPath).on('connect', () => {
      socket.destroy();
      resolve();
    });
  });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'memex-recall-daemon-'));
  socketPath = join(dir, 'recall.sock');
  respond = vi.fn(async () => [hit]);
  server = createRecallServer(respond);
  await listening(socketPath);
});

afterEach(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('createRecallServer', () => {
  it('answers a question with what the responder found', async () => {
    expect(JSON.parse(await ask('memex 검색 품질'))).toEqual([hit]);
    expect(respond).toHaveBeenCalledWith('memex 검색 품질');
  });

  it('answers a liveness probe without searching', async () => {
    expect(await ask(RECALL_PING)).toBe('[]');
    expect(respond).not.toHaveBeenCalled();
  });

  it('searches nothing for a caller that sent no query', async () => {
    expect(await ask('')).toBe('[]');
    expect(respond).not.toHaveBeenCalled();
  });

  it('outlives a caller that hangs up before the reply', async () => {
    await dropConnection();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(JSON.parse(await ask('여전히 살아있나'))).toEqual([hit]);
  });
});
