import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AutoTokenizer, env } from '@huggingface/transformers';
import { chunkNote, estimateTokens } from '../packages/utils/src/chunk.ts';

const usage = `Check the chunker against the real tokenizer.

  node --import tsx scripts/validate-chunks.mts [--db <path>]

Chunks every note in the DB and reports the true token length of each chunk.
The chunker budgets in estimated tokens, so this is the check that the estimate
never lets a chunk past the embedding model's 512-token window.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const dbPath = (() => {
  const i = process.argv.indexOf('--db');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : join(homedir(), '.memex/memex.db');
})();

env.cacheDir = join(homedir(), '.memex/models');
const tokenizer = await AutoTokenizer.from_pretrained('Xenova/multilingual-e5-base');

const db = new Database(dbPath, { readonly: true });
const notes = db
  .prepare('SELECT id, title, content, category, tags FROM notes')
  .all() as { id: number; title: string; content: string; category: string | null; tags: string }[];

const chunks = notes.flatMap((note) =>
  chunkNote({
    title: note.title,
    content: note.content,
    folder: note.category ?? undefined,
    tags: JSON.parse(note.tags),
  }).map((chunk) => ({ noteId: note.id, ...chunk })),
);

const measured = chunks.map((chunk) => ({
  noteId: chunk.noteId,
  real: tokenizer.encode(`passage: ${chunk.text}`).length,
  estimated: estimateTokens(chunk.text),
}));

const sorted = [...measured].sort((a, b) => a.real - b.real);
const at = (q: number) => sorted[Math.floor(sorted.length * q)].real;
const over = measured.filter((m) => m.real > 512);
const perNote = chunks.reduce<Record<number, number>>(
  (acc, c) => ({ ...acc, [c.noteId]: (acc[c.noteId] ?? 0) + 1 }),
  {},
);
const counts = Object.values(perNote).sort((a, b) => a - b);
const ratios = measured.map((m) => m.estimated / m.real).sort((a, b) => a - b);

console.log(`notes ${notes.length} → chunks ${chunks.length}`);
console.log(`chunks/note: p50 ${counts[Math.floor(counts.length / 2)]} · max ${counts.at(-1)}`);
console.log(`real tokens: p50 ${at(0.5)} · p90 ${at(0.9)} · p99 ${at(0.99)} · max ${sorted.at(-1)?.real}`);
console.log(`over 512: ${over.length} (${((100 * over.length) / measured.length).toFixed(2)}%)`);
console.log(
  `estimate/real ratio: p1 ${ratios[Math.floor(ratios.length * 0.01)].toFixed(2)} · p50 ${ratios[Math.floor(ratios.length / 2)].toFixed(2)} · p99 ${ratios[Math.floor(ratios.length * 0.99)].toFixed(2)}`,
);
if (over.length > 0) {
  console.log(`worst offenders: ${over.sort((a, b) => b.real - a.real).slice(0, 5).map((m) => `#${m.noteId} ${m.real}tok (est ${m.estimated})`).join(' · ')}`);
}

const covered = chunks.reduce((acc, c) => acc + c.excerpt.length, 0);
const total = notes.reduce((acc, n) => acc + n.content.length, 0);
console.log(`body coverage: ${((100 * covered) / total).toFixed(1)}% of note chars land in a chunk`);
