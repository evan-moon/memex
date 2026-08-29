import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { type MemexClient, openDb } from '@memex/db';
import { createLazyEmbedder } from '@memex/embed';
import { CONFIG_DIR, expandPath, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';
import { guardEmbeddingModel } from '../embedding-guard.ts';
import { getMcpBinPath } from '../mcp-clients/index.ts';
import { startUiServer, type UiDeps } from './server.ts';
import { createShapeFiller } from './shapes.ts';

export type MemexHost = {
  url: string;
  client: MemexClient;
};

const openInBrowser = (target: string) => {
  spawn('open', [target], { stdio: 'ignore', detached: true }).unref();
};

// Both shells — the `ui` command and the desktop app — need the same vault, the
// same embedder and the same idea of where this machine keeps things. Building
// it twice is how the two drift into answering differently.
export const createUiDeps = (): UiDeps & { client: MemexClient } => {
  const client = openDb(CONFIG_DIR);
  guardEmbeddingModel(client);

  return {
    client,
    // Loaded on the first search rather than now: the model is ~450MB and the
    // window has to appear before it lands.
    embedder: createLazyEmbedder(MODEL_CACHE_DIR),
    vaultPath: expandPath(loadConfig().vault_path),
    mcp: { home: homedir(), serverPath: getMcpBinPath() },
    pathEnv: process.env.PATH ?? '',
    openUrl: openInBrowser,
    fillShapes: createShapeFiller({ client }).fill,
  };
};

export const startMemexHost = async (port: number): Promise<MemexHost> => {
  const deps = createUiDeps();
  const url = await startUiServer(deps, port);
  return { url, client: deps.client };
};
