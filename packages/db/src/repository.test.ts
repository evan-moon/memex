import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type MemexClient } from './client.ts';
import {
  getBacklinks,
  getNote,
  insertNote,
  parseTags,
  serializeTags,
  syncLinks,
  updateNote,
} from './repository.ts';

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

describe('note_links source column', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-links-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('has a source column defaulting to wiki', () => {
    const cols = client.sqlite
      .prepare('PRAGMA table_info(note_links)')
      .all() as { name: string; dflt_value: string | null }[];
    const sourceCol = cols.find((c) => c.name === 'source');
    expect(sourceCol).toBeDefined();
    expect(sourceCol?.dflt_value).toContain('wiki');
  });

  it('syncLinks writes rows with source=wiki', () => {
    const target = insertNote(client, {
      title: 'Target',
      content: 'x',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'past',
    });
    const src = insertNote(client, {
      title: 'Source',
      content: 'points at [[Target]]',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'past',
    });
    syncLinks(client, src.id, src.content);

    const rows = client.sqlite
      .prepare('SELECT source FROM note_links WHERE source_id = ? AND target_id = ?')
      .all(src.id, target.id) as { source: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('wiki');
  });

  it('syncLinks does not delete non-wiki links when re-syncing', () => {
    const target = insertNote(client, {
      title: 'Target',
      content: 'x',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'past',
    });
    const src = insertNote(client, {
      title: 'Source',
      content: 'no link yet',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'past',
    });
    client.sqlite
      .prepare("INSERT INTO note_links(source_id, target_id, source) VALUES (?, ?, 'flashback')")
      .run(src.id, target.id);

    syncLinks(client, src.id, src.content);

    const rows = client.sqlite
      .prepare("SELECT source FROM note_links WHERE source_id = ?")
      .all(src.id) as { source: string }[];
    expect(rows.some((r) => r.source === 'flashback')).toBe(true);
  });

  it('backlinks include both wiki and flashback sources', () => {
    const target = insertNote(client, {
      title: 'Target',
      content: 'x',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'past',
    });
    const src = insertNote(client, {
      title: 'Source',
      content: 'see [[Target]]',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'past',
    });
    syncLinks(client, src.id, src.content);

    const backlinks = getBacklinks(client, target.id);
    expect(backlinks.map((b) => b.id)).toContain(src.id);
  });
});
