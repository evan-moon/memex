import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dismissDanglingFor, insertNote, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildToday, DAILY } from './today.ts';

let dbDir: string;
let vaultDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-today-db-'));
  vaultDir = mkdtempSync(join(tmpdir(), 'memex-today-vault-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vaultDir, { recursive: true, force: true });
});

const addNote = (title: string, layer: 'past' | 'state' = 'past', content = 'the body') =>
  insertNote(client, {
    title,
    content,
    filePath: join(vaultDir, `${title}.md`),
    source: 'manual',
    layer,
  });

const link = (from: number, to: number) =>
  client.sqlite
    .prepare(
      `INSERT INTO note_links (source_id, target_id, source) VALUES (?, ?, 'wiki')
       ON CONFLICT DO NOTHING`,
    )
    .run(from, to);

const judgement = (title: string) => {
  const source = addNote(`${title} source`);
  const note = addNote(title, 'state');
  link(note.id, source.id);
  return note;
};

const today = () => buildToday(client, vaultDir);

describe('buildToday', () => {
  it('hands over a day someone can see the end of', () => {
    for (let i = 0; i < 40; i += 1) judgement(`judgement ${i}`);

    expect(today().items.length).toBeLessThanOrEqual(DAILY);
  });

  it('keeps the day a single digit, which is the whole point', () => {
    expect(DAILY).toBeLessThan(10);
  });

  it('says how much is waiting without putting it in the day', () => {
    for (let i = 0; i < 20; i += 1) judgement(`judgement ${i}`);

    const { items, buried } = today();
    const inDay = items.filter((i) => i.kind === 'undeclared').length;

    expect(inDay + buried.undeclared).toBe(20);
  });

  it('lets no one kind take the whole day', () => {
    for (let i = 0; i < 20; i += 1) judgement(`judgement ${i}`);
    const noisy = addNote(
      'a note with many near misses',
      'past',
      '[[judgement 0x]] [[judgement 1x]]',
    );
    expect(noisy.id).toBeGreaterThan(0);

    const kinds = new Set(today().items.map((i) => i.kind));

    expect(kinds.size).toBeGreaterThan(1);
  });

  it('counts a link to something unwritten apart from a broken one', () => {
    addNote('a plan', 'past', 'points at [[something nobody wrote]]');

    const { buried } = today();

    expect(buried.forwardLinks).toBe(1);
    expect(buried.placeholders).toBe(0);
  });

  it('stops counting the links of a note whose links were put aside', () => {
    const note = addNote('a plan', 'past', 'points at [[something nobody wrote]]');
    expect(today().buried.forwardLinks).toBe(1);

    dismissDanglingFor(client, note.id);

    expect(today().buried.forwardLinks).toBe(0);
  });

  it('has an empty day when there is nothing to answer', () => {
    expect(today().items).toEqual([]);
  });
});
