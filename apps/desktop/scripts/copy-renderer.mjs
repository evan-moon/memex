#!/usr/bin/env node
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The page travels beside main.js rather than inside it. electron-builder packs
// `dist/**/*`, and the protocol handler reads the files back out of there.
const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(desktop, '../ui/dist');
const to = join(desktop, 'dist/renderer');

if (!existsSync(from)) {
  console.error(`No built renderer at ${from} — run the UI build first.`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`renderer copied to ${to.replace(`${desktop}/`, '')}`);
