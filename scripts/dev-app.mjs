#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = `Run the app against your real vault, with the screen hot-reloading.

  node scripts/dev-app.mjs [--port <vite port>]

Two processes. Vite owns the page and swaps a component without losing where you
were; Electron owns everything else. The window still loads memex://app/ — the
protocol handler asks Vite for the page instead of reading it off disk, so /api
goes the same way it does in a packaged build.

Nothing here is swapped. better-sqlite3 keeps a build per runtime, so the CLI,
the MCP server and the tests go on working while the app is up.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const flag = process.argv.indexOf('--port');
const port = flag === -1 ? '5173' : process.argv[flag + 1];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(root, 'node_modules/.bin', name);

const children = [];

const stop = (code) => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(code ?? 0);
};

const run = (label, command, args, cwd, env) => {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
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

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const portIsFree = (n) =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(Number(n), '127.0.0.1');
  });

// Vite has to be answering before the window asks it for the page: the first
// request is the document itself, and a window that gets nothing shows nothing
// and does not retry.
const answering = async (url, attempts = 60) => {
  for (let left = attempts; left > 0; left -= 1) {
    const reached = await fetch(url).then(
      () => true,
      () => false,
    );
    if (reached) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

if (!(await portIsFree(port))) {
  console.error(`Port ${port} is already serving something. Stop it, or pass --port.`);
  process.exit(1);
}

// Awaited, not raced: electron loads dist/main.js at startup, so a half-written
// bundle is a window that never opens.
await new Promise((resolve, reject) => {
  const build = spawn(bin('tsup'), [], { cwd: join(root, 'apps/desktop'), stdio: 'inherit' });
  build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tsup exited ${code}`))));
});

run('page ', bin('vite'), ['--port', port], join(root, 'apps/ui'));

const devServer = `http://localhost:${port}`;
if (!(await answering(devServer))) {
  console.error(`Vite never answered on ${devServer}.`);
  stop(1);
}

run('app  ', bin('electron'), [join(root, 'apps/desktop')], root, { MEMEX_DEV_SERVER: devServer });
