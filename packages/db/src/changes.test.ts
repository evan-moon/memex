import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changeHead, hasChangeFrom } from './changes.ts';
import { type MemexClient, openDb } from './client.ts';
import { deleteNote, insertNote, updateNote } from './repository.ts';

describe('note change log', () => {
  let dir: string;
  let client: MemexClient;

  const addNote = (title: string, content = 'x') =>
    insertNote(client, {
      title,
      content,
      filePath: join(dir, `${title}.md`),
      category: null,
      tags: '[]',
      source: 'manual',
      layer: 'past',
      author: 'person',
      authoredAt: null,
    });

  const kindsSince = (from: number) =>
    (
      client.sqlite.prepare('SELECT kind FROM note_changes WHERE id > ? ORDER BY id').all(from) as {
        kind: string;
      }[]
    ).map((row) => row.kind);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-changes-'));
    client = openDb(dir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records everything a new note brings with it', () => {
    addNote('fresh');
    expect(kindsSince(0)).toEqual(['content', 'title', 'tags', 'links']);
  });

  it('records only what an edit actually touched', () => {
    const note = addNote('kept');
    const head = changeHead(client);

    updateNote(client, note.id, { tags: '["one"]' });
    expect(kindsSince(head)).toEqual(['tags']);
  });

  it('counts a body edit as a link change too, since links live in the body', () => {
    const note = addNote('kept');
    const head = changeHead(client);

    updateNote(client, note.id, { content: 'now with [[a link]]' });
    expect(kindsSince(head)).toEqual(['content', 'links']);
  });

  it('records a deletion, which bumps no timestamp of its own', () => {
    const note = addNote('doomed');
    const head = changeHead(client);

    deleteNote(client, note.id);
    expect(kindsSince(head)).toEqual(['removed']);
  });

  it('answers whether a kind a detector reads has moved', () => {
    const note = addNote('kept');
    const head = changeHead(client);

    updateNote(client, note.id, { tags: '["one"]' });

    expect(hasChangeFrom(client, head + 1, ['tags'])).toBe(true);
    expect(hasChangeFrom(client, head + 1, ['content', 'links'])).toBe(false);
  });

  it('reports an empty log as nothing to read', () => {
    expect(changeHead(client)).toBe(0);
    expect(hasChangeFrom(client, 1, ['content'])).toBe(false);
  });
});
