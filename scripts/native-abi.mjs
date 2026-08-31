#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// better-sqlite3 is built against V8's ABI rather than Node-API, so one build
// cannot serve both runtimes: the CLI, the MCP server and the tests run on
// system Node, the desktop app runs on Electron's, and the numbers differ.
// Swapping the one file `bindings` looks for meant only one of them could run
// at a time. Both builds are kept instead, each under the name of the runtime
// it was built for, and `packages/db` asks for the one it can load.
const MODULE = 'better-sqlite3';

const moduleDir = dirname(require.resolve(`${MODULE}/package.json`));
const releaseDir = join(moduleDir, 'build/Release');

// Where `prebuild-install` puts what it downloads, and the only name `bindings`
// will find. It stays the Node build a plain `yarn install` produces, so a
// checkout that never runs this script still has working tests.
const downloaded = join(releaseDir, 'better_sqlite3.node');

const bindingFor = (runtime) => join(releaseDir, `better_sqlite3-${runtime}.node`);

const STAMP = join(releaseDir, 'memex-abi.json');

const wanted = {
  node: process.versions.node,
  electron: require('electron/package.json').version,
};

const recorded = () => {
  try {
    return JSON.parse(readFileSync(STAMP, 'utf8'));
  } catch {
    return {};
  }
};

const record = recorded();

const missing = Object.entries(wanted).filter(
  ([runtime, version]) => record[runtime] !== version || !existsSync(bindingFor(runtime)),
);

if (missing.length === 0) {
  console.log(`${MODULE} is built for node ${wanted.node} and electron ${wanted.electron}`);
  process.exit(0);
}

for (const [runtime, version] of missing) {
  execFileSync('npx', ['prebuild-install', '--runtime', runtime, '--target', version], {
    cwd: moduleDir,
    stdio: 'inherit',
  });

  // An unsigned .node downloaded onto arm64 macOS is killed on load with no
  // message anyone can act on — the process simply dies. Signing it ad hoc is
  // what makes the failure not happen.
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--sign', '-', downloaded]);
  }

  copyFileSync(downloaded, bindingFor(runtime));
}

copyFileSync(bindingFor('node'), downloaded);

// @electron/rebuild records the ABI it last built for and skips the work when
// the record matches. Leaving a record that disagrees with the file underneath
// it is how a packaged app came to ship a binary built for the wrong runtime.
rmSync(join(releaseDir, '.forge-meta'), { force: true });

writeFileSync(STAMP, `${JSON.stringify(wanted, null, 2)}\n`);

console.log(
  `${MODULE} is now built for node ${wanted.node} and electron ${wanted.electron}, side by side`,
);
