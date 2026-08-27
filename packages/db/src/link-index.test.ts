import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { deleteNote, insertNote, resolveLinkTargets, updateNote } from './repository.ts';

describe('note title index', () => {
  let dir: string;
  let client: MemexClient;

  const addNote = (title: string) =>
    insertNote(client, {
      title,
      content: '',
      filePath: join(dir, `${title.replace(/\//g, '_')}.md`),
      category: null,
      tags: '[]',
      source: 'manual',
      layer: 'past',
      author: 'person',
      authoredAt: null,
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-link-index-'));
    client = openDb(dir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a link by the note title as written', () => {
    const note = addNote('Obsidian 정합성 재편');
    expect(resolveLinkTargets(client, ['Obsidian 정합성 재편']).get('Obsidian 정합성 재편')).toBe(
      note.id,
    );
  });

  it('resolves a link written against the filename a title could not keep', () => {
    const note = addNote('a/b');
    expect(resolveLinkTargets(client, ['a／b']).get('a／b')).toBe(note.id);
  });

  it('prefers a title holding a # over reading the same characters as an anchor', () => {
    const anchored = addNote('memex');
    const literal = addNote('memex #1440');

    const resolved = resolveLinkTargets(client, ['memex #1440']);
    expect(resolved.get('memex #1440')).toBe(literal.id);
    expect(resolved.get('memex #1440')).not.toBe(anchored.id);
  });

  it('falls back to the stem when no note is named the whole target', () => {
    const note = addNote('memex');
    expect(resolveLinkTargets(client, ['memex#Architecture']).get('memex#Architecture')).toBe(
      note.id,
    );
  });

  it('follows a renamed note and stops answering to its old title', () => {
    const note = addNote('old name');
    updateNote(client, note.id, { title: 'new name' });

    expect(resolveLinkTargets(client, ['new name']).get('new name')).toBe(note.id);
    expect(resolveLinkTargets(client, ['old name']).has('old name')).toBe(false);
  });

  it('leaves the index alone when an edit does not touch the title', () => {
    const note = addNote('kept');
    updateNote(client, note.id, { content: 'edited' });

    expect(resolveLinkTargets(client, ['kept']).get('kept')).toBe(note.id);
  });

  it('stops resolving a deleted note', () => {
    const note = addNote('gone');
    deleteNote(client, note.id);

    expect(resolveLinkTargets(client, ['gone']).has('gone')).toBe(false);
  });

  it('gives a title collision to the newest note', () => {
    addNote('same');
    const newer = insertNote(client, {
      title: 'same',
      content: '',
      filePath: join(dir, 'same-2.md'),
      category: null,
      tags: '[]',
      source: 'manual',
      layer: 'past',
      author: 'person',
      authoredAt: null,
    });

    expect(resolveLinkTargets(client, ['same']).get('same')).toBe(newer.id);
  });

  it('resolves nothing for an empty target list without touching the index', () => {
    addNote('present');
    expect(resolveLinkTargets(client, []).size).toBe(0);
  });
});
