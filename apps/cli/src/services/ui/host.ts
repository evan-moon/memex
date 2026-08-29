import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { type MemexClient, openDb } from '@memex/db';
import { CONFIG_DIR, expandPath, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';
import { guardEmbeddingModel } from '../embedding-guard.ts';
import { getMcpBinPath } from '../mcp-clients/index.ts';
import { createModelRunner } from './model.ts';
import type { UiDeps } from './server.ts';
import { createShapeFiller } from './shapes.ts';

const openInBrowser = (target: string) => {
  spawn('open', [target], { stdio: 'ignore', detached: true }).unref();
};

// Everything the app needs to answer a request: the vault, the embedder, and
// where this machine keeps things. The window reaches it through the app's own
// `memex://` handler, so nothing here listens on anything.
export const createUiDeps = (): UiDeps & { client: MemexClient } => {
  const client = openDb(CONFIG_DIR);
  guardEmbeddingModel(client);
  // One runner, and the embedder is its. Loading the weights twice at once
  // corrupts the file both loaders are reading.
  const model = createModelRunner(MODEL_CACHE_DIR);

  return {
    client,
    // Loaded on the first search rather than now: the weights are ~282MB and the
    // window has to appear before they land.
    embedder: model.embed,
    vaultPath: expandPath(loadConfig().vault_path),
    mcp: { home: homedir(), serverPath: getMcpBinPath() },
    pathEnv: process.env.PATH ?? '',
    openUrl: openInBrowser,
    model,
    fillShapes: createShapeFiller({ client }).fill,
  };
};
