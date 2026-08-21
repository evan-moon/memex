#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = `Run the UI with hot reload against a live memex.

  node scripts/dev-ui.mjs [--port <api port>]

Two processes, because the two halves reload differently. Vite owns the page
and swaps a component without losing where you were; the API is a Node server,
so it can only be restarted, and tsx watches it for you. The proxy in
apps/ui/vite.config.ts is what makes them one origin.

The built page in apps/cli/src/services/ui/page.ts is not involved here. It is
a build artifact, so run \`yarn build\` before checking what \`memex ui\` serves.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const portFlag = process.argv.indexOf('--port');
const apiPort = portFlag === -1 ? '4321' : process.argv[portFlag + 1];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(root, 'node_modules/.bin', name);

const children = [];

const run = (label, command, args, cwd, env) => {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  const say = (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim().length > 0) console.log(`${label} ${line}`);
    }
  };
  child.stdout.on('data', say);
  child.stderr.on('data', say);
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) stop(code);
  });
  children.push(child);
  return child;
};

const stop = (code) => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(code ?? 0);
};

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

run(
  'api ',
  bin('tsx'),
  ['watch', 'src/index.ts', 'ui', '--port', apiPort, '--no-open'],
  join(root, 'apps/cli'),
);
run('page', bin('vite'), [], join(root, 'apps/ui'), { MEMEX_API_PORT: apiPort });
