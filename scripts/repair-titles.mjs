#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, syncLinks, updateNote } from '../packages/db/dist/index.js';
import { yamlScalar } from '../packages/utils/dist/index.js';

const usage = `Re-read every note's title from its file, using the YAML rules the indexer
now follows, and fix the ones the old parser stored wrong.

  node scripts/repair-titles.mjs [--db <dir>] [--apply]

A title written as "…\\"갭\\"…" is a double-quoted YAML scalar and means …"갭"….
The old parser stripped the outer quotes and left the escapes, so the title
never matched the wiki links pointing at it. A title written unquoted, like
공백을 찾아내는 \\s 캐릭터 클래스, is literal and is left alone.

Reads the vault, writes only the database. No note file is touched.`;

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const DB = arg('--db', join(homedir(), '.memex'));
const APPLY = process.argv.includes('--apply');

const titleFromFile = (content) => {
  if (!content.startsWith('---')) return undefined;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return undefined;
  const line = content.slice(3, end).match(/^title:[ \t]*(.*)$/m)?.[1];
  return line === undefined ? undefined : yamlScalar(line);
};

const client = openDb(DB);
const notes = client.sqlite
  .prepare('SELECT id, title, file_path AS filePath, content FROM notes')
  .all();

const wrong = notes.flatMap((note) => {
  if (!existsSync(note.filePath)) return [];
  const parsed = titleFromFile(readFileSync(note.filePath, 'utf8'));
  return parsed && parsed !== note.title ? [{ ...note, parsed }] : [];
});

console.log(`${notes.length} notes, ${wrong.length} whose stored title is not what the file says\n`);
for (const note of wrong) {
  console.log(`#${note.id}`);
  console.log(`  stored: ${note.title}`);
  console.log(`  file  : ${note.parsed}`);
}

if (!APPLY) {
  console.log(`\nDry run. Pass --apply to write these ${wrong.length} titles to the database.`);
  process.exit(0);
}

for (const note of wrong) updateNote(client, note.id, { title: note.parsed });

// Titles are how a wiki link finds its target, so links that could not resolve
// against the mangled title have to be given another chance.
const all = client.sqlite.prepare('SELECT id, content FROM notes').all();
for (const note of all) syncLinks(client, note.id, note.content);

console.log(`\nRewrote ${wrong.length} titles and rebuilt the link graph.`);
