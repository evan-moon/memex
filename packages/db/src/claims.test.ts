import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getNoteShape, indexTypeNoteIds, setNoteShape } from './claims.ts';
import { type MemexClient, openDb } from './client.ts';
import { insertNote, updateNote } from './repository.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-claims-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const add = (title: string, content: string) =>
  insertNote(client, {
    title,
    content,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer: 'state',
  });

describe('note shape', () => {
  it('keeps the claims a note makes, in the order they were read', () => {
    const note = add('a plan', 'body');
    setNoteShape(client, { noteId: note.id, kind: 'position', claims: ['첫째', '둘째', '셋째'] });

    expect(getNoteShape(client, note.id)?.claims).toEqual(['첫째', '둘째', '셋째']);
  });

  it('treats a note past the claim ceiling as an index, whatever it was called', () => {
    const note = add('a roster', 'body');
    const shape = setNoteShape(client, {
      noteId: note.id,
      kind: 'position',
      claims: Array.from({ length: 11 }, (_, i) => `주장 ${i}`),
    });

    expect(shape?.kind).toBe('index');
    expect(getNoteShape(client, note.id)?.claims).toEqual([]);
  });

  it('keeps a note at the ceiling as the position it was read as', () => {
    const note = add('a long plan', 'body');
    const shape = setNoteShape(client, {
      noteId: note.id,
      kind: 'position',
      claims: Array.from({ length: 10 }, (_, i) => `주장 ${i}`),
    });

    expect(shape?.kind).toBe('position');
  });

  it('drops the claims an index note was mistakenly given', () => {
    const note = add('an index', 'body');
    setNoteShape(client, { noteId: note.id, kind: 'index', claims: ['하나'] });

    expect(getNoteShape(client, note.id)?.claims).toEqual([]);
  });

  it('replaces the previous reading rather than appending to it', () => {
    const note = add('a plan', 'body');
    setNoteShape(client, { noteId: note.id, kind: 'position', claims: ['하나', '둘'] });
    setNoteShape(client, { noteId: note.id, kind: 'position', claims: ['다시'] });

    expect(getNoteShape(client, note.id)?.claims).toEqual(['다시']);
  });

  it('calls the reading stale once the note body moves underneath it', () => {
    const note = add('a plan', 'body as first written');
    setNoteShape(client, { noteId: note.id, kind: 'position', claims: ['하나'] });
    expect(getNoteShape(client, note.id)?.stale).toBe(false);

    updateNote(client, note.id, { content: 'body, rewritten' });
    expect(getNoteShape(client, note.id)?.stale).toBe(true);
  });

  it('has no reading for a note nobody has read yet', () => {
    expect(getNoteShape(client, add('unread', 'body').id)).toBeNull();
  });
});

describe('indexTypeNoteIds', () => {
  it('lists the index notes so the queue can leave them out', () => {
    const index = add('an index', 'body');
    const position = add('a plan', 'body');
    setNoteShape(client, { noteId: index.id, kind: 'index', claims: [] });
    setNoteShape(client, { noteId: position.id, kind: 'position', claims: ['하나'] });

    expect(indexTypeNoteIds(client)).toEqual([index.id]);
  });

  it('puts a rewritten index back in the queue instead of excluding it on an old reading', () => {
    const index = add('an index', 'body as first written');
    setNoteShape(client, { noteId: index.id, kind: 'index', claims: [] });
    expect(indexTypeNoteIds(client)).toEqual([index.id]);

    updateNote(client, index.id, { content: 'now it argues something' });
    expect(indexTypeNoteIds(client)).toEqual([]);
  });
});
