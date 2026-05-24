import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type MemexClient } from './client.ts';
import { getNote, insertNote, parseTags, serializeTags, updateNote } from './repository.ts';

describe('parseTags', () => {
  it('parses a valid JSON tag array', () => {
    expect(parseTags('["typescript","monorepo"]')).toEqual(['typescript', 'monorepo']);
  });

  it('returns an empty array for an empty JSON array', () => {
    expect(parseTags('[]')).toEqual([]);
  });

  it('returns an empty array for invalid JSON', () => {
    expect(parseTags('not-json')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseTags('')).toEqual([]);
  });
});

describe('serializeTags', () => {
  it('serializes a tag array to JSON', () => {
    expect(serializeTags(['typescript', 'monorepo'])).toBe('["typescript","monorepo"]');
  });

  it('serializes an empty array', () => {
    expect(serializeTags([])).toBe('[]');
  });

  it('round-trips through parseTags', () => {
    const tags = ['a', 'b', 'c'];
    expect(parseTags(serializeTags(tags))).toEqual(tags);
  });
});

describe('notes.layer', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-test-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('insertNote persists an explicit layer', () => {
    const note = insertNote(client, {
      title: 'roadmap',
      content: 'todo: ...',
      filePath: join(dbDir, 'roadmap.md'),
      source: 'manual',
      layer: 'state',
    });
    expect(note.layer).toBe('state');
    expect(getNote(client, note.id)?.layer).toBe('state');
  });

  it('insertNote defaults missing layer to past', () => {
    const note = insertNote(client, {
      title: 'old retro',
      content: 'looked back',
      filePath: join(dbDir, 'old-retro.md'),
      source: 'manual',
    });
    expect(note.layer).toBe('past');
  });

  it('updateNote is layer-agnostic at the DB layer (service guards immutability)', () => {
    const note = insertNote(client, {
      title: 'rule',
      content: 'be terse',
      filePath: join(dbDir, 'rule.md'),
      source: 'manual',
      layer: 'rule',
    });

    const updated = updateNote(client, note.id, { content: 'be even more terse' });
    expect(updated.content).toBe('be even more terse');
    expect(updated.layer).toBe('rule');
  });
});
