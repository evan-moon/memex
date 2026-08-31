import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

export type Runtime = 'node' | 'electron';

export const currentRuntime = (): Runtime => (process.versions.electron ? 'electron' : 'node');

export const releaseDir = () =>
  join(dirname(require.resolve('better-sqlite3/package.json')), 'build/Release');

// `scripts/native-abi.mjs` keeps a build per runtime, each under the name of
// the runtime it was built for, so the app and the MCP server can hold the
// vault open at the same time. Nothing here is missing when one is not there:
// a checkout that never ran the script, and every build electron-builder
// rebuilds itself, still have the single file `bindings` looks for.
export const sqliteBinding = (
  dir = releaseDir(),
  runtime = currentRuntime(),
): string | undefined => {
  const built = join(dir, `better_sqlite3-${runtime}.node`);
  return existsSync(built) ? built : undefined;
};
