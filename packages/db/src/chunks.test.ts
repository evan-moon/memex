import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  countChunks,
  deleteNote,
  deleteNoteChunks,
  insertNote,
  replaceNoteChunks,
  saveEmbedding,
  searchNotes,
  serializeTags,
} from './repository.ts';

const unit = (i: number): number[] => {
  const v = new Array(768).fill(0);
  v[i] = 1;
  return v;
};

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-chunks-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, content: string) =>
  insertNote(client, {
    title,
    content,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer: 'past',
    tags: serializeTags([]),
  });

const chunk = (ord: number, excerpt: string, embedding: number[]) => ({
  ord,
  heading: null,
  excerpt,
  startChar: 0,
  endChar: excerpt.length,
  embedding,
});

describe('chunk storage', () => {
  it('replaces a note chunks instead of accumulating them', () => {
    const note = addNote('n', 'body');
    replaceNoteChunks(client, note.id, [chunk(0, 'a', unit(1)), chunk(1, 'b', unit(2))]);
    replaceNoteChunks(client, note.id, [chunk(0, 'c', unit(3))]);
    expect(countChunks(client)).toBe(1);
  });

  it('drops the vectors along with the chunk rows', () => {
    const note = addNote('n', 'body');
    replaceNoteChunks(client, note.id, [chunk(0, 'a', unit(1))]);
    deleteNoteChunks(client, note.id);
    const { n } = client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM note_chunk_embeddings')
      .get() as { n: number };
    expect(n).toBe(0);
  });

  it('takes the chunks with the note when it is deleted', () => {
    const note = addNote('n', 'body');
    replaceNoteChunks(client, note.id, [chunk(0, 'a', unit(1))]);
    deleteNote(client, note.id);
    expect(countChunks(client)).toBe(0);
  });
});

describe('chunk search arm', () => {
  it('finds a note whose answer only lives in a later chunk', () => {
    const buried = addNote('buried', 'opening paragraph about something else entirely');
    saveEmbedding(client, buried.id, unit(500));
    replaceNoteChunks(client, buried.id, [
      chunk(0, 'opening paragraph', unit(500)),
      chunk(1, 'the answer lives here', unit(7)),
    ]);

    const decoy = addNote('decoy', 'unrelated');
    saveEmbedding(client, decoy.id, unit(400));
    replaceNoteChunks(client, decoy.id, [chunk(0, 'unrelated', unit(400))]);

    const hits = searchNotes(client, 'answer', unit(7), 5);
    expect(hits[0].id).toBe(buried.id);
  });

  it('returns the matching chunk as the snippet, not the note opening', () => {
    const note = addNote('n', 'opening paragraph about something else entirely');
    saveEmbedding(client, note.id, unit(500));
    replaceNoteChunks(client, note.id, [
      chunk(0, 'opening paragraph', unit(500)),
      chunk(1, 'the answer lives here', unit(7)),
    ]);
    expect(searchNotes(client, 'answer', unit(7), 5)[0].matchSnippet).toBe('the answer lives here');
  });

  it('still finds a note that has no chunks yet, so an un-reembedded DB keeps working', () => {
    const legacy = addNote('legacy', 'indexed before chunking existed');
    saveEmbedding(client, legacy.id, unit(7));
    expect(searchNotes(client, 'legacy', unit(7), 5)[0]?.id).toBe(legacy.id);
  });

  it('does not let the whole-note vector of a chunked note compete with its chunks', () => {
    const chunked = addNote('chunked', 'opening');
    saveEmbedding(client, chunked.id, unit(7));
    replaceNoteChunks(client, chunked.id, [chunk(0, 'opening', unit(400))]);

    const legacy = addNote('legacy', 'no chunks');
    saveEmbedding(client, legacy.id, unit(7));

    expect(searchNotes(client, 'q', unit(7), 5)[0]?.id).toBe(legacy.id);
  });

  it('counts a note once however many of its chunks match', () => {
    const note = addNote('n', 'body');
    saveEmbedding(client, note.id, unit(500));
    replaceNoteChunks(client, note.id, [
      chunk(0, 'first', unit(7)),
      chunk(1, 'second', unit(7)),
      chunk(2, 'third', unit(7)),
    ]);
    expect(searchNotes(client, 'x', unit(7), 5).filter((h) => h.id === note.id)).toHaveLength(1);
  });
});
