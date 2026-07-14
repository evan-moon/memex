import { existsSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { semanticSearch } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { isDaemonAlive } from './client.ts';
import { isFilesystemSocket, type RecallHit, recallSocketPath } from './socket.ts';

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const RECALL_LIMIT = 3;

const removeStaleSocket = (socketPath: string) => {
  if (isFilesystemSocket() && existsSync(socketPath)) unlinkSync(socketPath);
};

export const startRecallDaemon = async (configDir: string, modelCacheDir: string) => {
  const socketPath = recallSocketPath(configDir);
  const client = openDb(configDir);
  const embedder = await createEmbedder(modelCacheDir);

  const server = createServer({ allowHalfOpen: true }, (socket) => {
    const chunks: Buffer[] = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', async () => {
      const query = Buffer.concat(chunks).toString('utf8').trim();
      const notes = await semanticSearch(client, embedder, query, RECALL_LIMIT).catch(() => []);
      const hits: RecallHit[] = notes.map(({ id, title, layer }) => ({ id, title, layer }));
      socket.end(JSON.stringify(hits));
    });
  });

  const shutdown = () => {
    server.close();
    removeStaleSocket(socketPath);
    process.exit(0);
  };

  const resetIdleTimer = (() => {
    const timer = { current: setTimeout(shutdown, IDLE_TIMEOUT_MS) };
    return () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(shutdown, IDLE_TIMEOUT_MS);
    };
  })();

  server.on('connection', resetIdleTimer);
  server.on('error', async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') process.exit(1);
    if (await isDaemonAlive(socketPath)) process.exit(0);
    removeStaleSocket(socketPath);
    server.listen(socketPath);
  });

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(socketPath);
};
