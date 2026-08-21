import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertNote, type MemexClient, openDb, parseTags, serializeTags } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropTags, listTags, mergeCandidates, renameTags } from './tidy.ts';

let dbDir: string;
let vaultDir: string;
let outsideDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-tidy-db-'));
  vaultDir = mkdtempSync(join(tmpdir(), 'memex-tidy-vault-'));
  outsideDir = mkdtempSync(join(tmpdir(), 'memex-tidy-outside-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  for (const dir of [dbDir, vaultDir, outsideDir]) rmSync(dir, { recursive: true, force: true });
});

const addNote = (title: string, tags: string[], dir = vaultDir) => {
  const filePath = join(dir, `${title}.md`);
  writeFileSync(filePath, `---\ntitle: ${title}\ntags: [${tags.join(', ')}]\n---\n\nbody\n`, 'utf8');
  return insertNote(client, {
    title,
    content: 'body',
    filePath,
    source: 'manual',
    layer: 'past',
    tags: serializeTags(tags),
  });
};

const candidates = () => mergeCandidates(client, vaultDir);

describe('mergeCandidates', () => {
  it('proposes two spellings of one tag, keeping the one used more', () => {
    addNote('a', ['coffee-chat']);
    addNote('b', ['coffee-chat']);
    addNote('c', ['coffee_chat']);

    expect(candidates()).toEqual([
      expect.objectContaining({ kind: 'spelling', keep: 'coffee-chat', drop: ['coffee_chat'] }),
    ]);
  });

  it('proposes a pair that sits on almost exactly the same notes', () => {
    for (let i = 0; i < 6; i += 1) addNote(`n${i}`, ['커피챗', 'coffee-chat']);

    const overlap = candidates().filter((c) => c.kind === 'overlap');
    expect(overlap).toHaveLength(1);
    expect(overlap[0].drop).toEqual(['커피챗']);
    expect(overlap[0].overlap).toBe(1);
  });

  it('leaves alone two tags that merely keep company', () => {
    for (let i = 0; i < 6; i += 1) addNote(`both${i}`, ['toss', 'coaching']);
    for (let i = 0; i < 6; i += 1) addNote(`solo${i}`, ['toss']);

    expect(candidates().filter((c) => c.kind === 'overlap')).toEqual([]);
  });

  it('never counts overlap above what the tags share', () => {
    for (let i = 0; i < 6; i += 1) addNote(`n${i}`, ['a', 'b']);
    for (const candidate of candidates()) {
      expect(candidate.overlap ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('does not ask twice about a tag whose spelling already answers it', () => {
    for (let i = 0; i < 6; i += 1) addNote(`n${i}`, ['coffee-chat', 'coffee_chat']);

    const kinds = candidates().map((c) => c.kind);
    expect(kinds).toEqual(['spelling']);
  });
});

describe('renameTags', () => {
  it('rewrites the row and the file', () => {
    const note = addNote('a', ['커피챗']);

    const result = renameTags(client, vaultDir, new Map([['커피챗', 'coffee-chat']]));

    expect(result).toMatchObject({ notes: 1, files: 1, skipped: 0 });
    expect(parseTags(client.sqlite.prepare('SELECT tags FROM notes WHERE id = ?').pluck().get(note.id) as string)).toEqual(['coffee-chat']);
    expect(readFileSync(note.filePath, 'utf8')).toContain('coffee-chat');
  });

  it('folds a tag into one the note already carries without duplicating it', () => {
    const note = addNote('a', ['커피챗', 'coffee-chat']);

    renameTags(client, vaultDir, new Map([['커피챗', 'coffee-chat']]));

    expect(parseTags(client.sqlite.prepare('SELECT tags FROM notes WHERE id = ?').pluck().get(note.id) as string)).toEqual(['coffee-chat']);
  });

  it('will not edit a note that belongs to someone else', () => {
    const outside = addNote('theirs', ['커피챗'], outsideDir);
    const before = readFileSync(outside.filePath, 'utf8');

    const result = renameTags(client, vaultDir, new Map([['커피챗', 'coffee-chat']]));

    expect(result).toMatchObject({ notes: 0, skipped: 1 });
    expect(readFileSync(outside.filePath, 'utf8')).toBe(before);
  });
});

describe('dropTags', () => {
  const tagsOf = (id: number) =>
    parseTags(client.sqlite.prepare('SELECT tags FROM notes WHERE id = ?').pluck().get(id) as string);

  it('takes a tag off every note and out of every file', () => {
    const note = addNote('a', ['keep', 'junk']);

    const result = dropTags(client, vaultDir, ['junk']);

    expect(result).toMatchObject({ notes: 1, files: 1 });
    expect(tagsOf(note.id)).toEqual(['keep']);
    expect(readFileSync(note.filePath, 'utf8')).not.toContain('junk');
  });

  it('leaves a note with no tags at all rather than an empty one', () => {
    const note = addNote('a', ['only']);
    dropTags(client, vaultDir, ['only']);
    expect(tagsOf(note.id)).toEqual([]);
  });

  it('will not reach into someone else\'s notes', () => {
    const outside = addNote('theirs', ['junk'], outsideDir);
    dropTags(client, vaultDir, ['junk']);
    expect(readFileSync(outside.filePath, 'utf8')).toContain('junk');
  });
});

describe('listTags', () => {
  it('counts every tag and says how much of it memex may rewrite', () => {
    addNote('a', ['shared']);
    addNote('b', ['shared', 'mine']);
    addNote('theirs', ['shared'], outsideDir);

    expect(listTags(client, vaultDir)).toEqual([
      { tag: 'shared', notes: 3, mine: 2 },
      { tag: 'mine', notes: 1, mine: 1 },
    ]);
  });
});
