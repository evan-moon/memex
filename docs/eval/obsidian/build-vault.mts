import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const usage = `Build the vault both tools will be measured on.

  node --import tsx docs/eval/obsidian/build-vault.mts [--out <dir>]

Writes every indexed note out of the DB, so Obsidian sees the exact text memex
searched — not the source files, which live under three different roots and
would leave Obsidian with a smaller corpus.

Files are named "<title> (#id).md": the blog notes are all called index.md or
en.md on disk, which is unusable both as an answer key and as something to read
in a file list. The id suffix also means the manual step records numbers rather
than long titles.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const OUT = arg('--out', join(homedir(), 'Documents', 'memex-eval-vault'));

const sanitize = (title: string): string =>
  title
    .replace(/\//g, '／')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: filesystem-illegal characters
    .replace(/[<>:"\\|?*#^[\]\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
    .normalize('NFC');

const db = new Database(join(homedir(), '.memex', 'memex.db'), { readonly: true });
const notes = db.prepare('SELECT id, title, content FROM notes ORDER BY id').all() as {
  id: number;
  title: string;
  content: string;
}[];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const note of notes) {
  const name = `${sanitize(note.title) || 'untitled'} (#${note.id}).md`;
  writeFileSync(join(OUT, name), note.content, 'utf8');
}

console.log(`wrote ${notes.length} notes to ${OUT}`);
console.log(`open this folder as an Obsidian vault, install Smart Connections, let it finish embedding`);
