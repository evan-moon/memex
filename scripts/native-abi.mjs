#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// better-sqlite3 is built against V8's ABI rather than Node-API, so one build
// cannot serve both runtimes: the CLI and the tests run on system Node, the
// desktop app runs on Electron's, and the numbers differ. The binary is swapped
// rather than duplicated because `bindings` only ever looks in build/Release.
const MODULE = 'better-sqlite3';

const target = process.argv[2];
if (target !== 'node' && target !== 'electron') {
  console.error('usage: native-abi.mjs <node|electron>');
  process.exit(1);
}

const moduleDir = dirname(require.resolve(`${MODULE}/package.json`));

const electronVersion = () => {
  const { version } = require('electron/package.json');
  return version;
};

const args =
  target === 'electron'
    ? ['--runtime', 'electron', '--target', electronVersion()]
    : ['--runtime', 'node', '--target', process.versions.node];

execFileSync('npx', ['prebuild-install', ...args], { cwd: moduleDir, stdio: 'inherit' });

// An unsigned .node downloaded onto arm64 macOS is killed on load with no
// message anyone can act on — the process simply dies. Signing it ad hoc is
// what makes the failure not happen.
if (process.platform === 'darwin') {
  execFileSync('codesign', [
    '--force',
    '--sign',
    '-',
    join(moduleDir, 'build/Release/better_sqlite3.node'),
  ]);
}

console.log(`${MODULE} is now built for ${target}`);
