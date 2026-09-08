import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { getDocumentMeta, setDocumentMeta } from './document-meta.ts';
import { LATEST_SCHEMA_VERSION } from './migrations.ts';

let dir: string;
let client: MemexClient;

const addNote = (title: string) => {
  const result = client.sqlite
    .prepare(
      `INSERT INTO notes (title, content, file_path, created_at, updated_at)
       VALUES (?, 'body', ?, 1, 1)`,
    )
    .run(title, join(dir, `${title}.md`));
  return Number(result.lastInsertRowid);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-doc-meta-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('getDocumentMeta', () => {
  // The contract is explicit: a note that predates this table has no evidence of
  // who wrote it, and `notes.author` defaults to person for everything. Reading
  // that default as ownership would hand the person authorship of the agent's
  // whole corpus.
  it('does not promote a note with no meta row to person', () => {
    const id = addNote('an old note');

    expect(getDocumentMeta(client, id)).toMatchObject({
      documentId: id,
      origin: 'unknown',
      kind: 'unknown',
      mode: 'legacy-memory',
      writingStatus: null,
      currentRevision: null,
    });
  });

  it('answers for a note that does not exist rather than throwing', () => {
    expect(getDocumentMeta(client, 9999).origin).toBe('unknown');
  });
});

describe('setDocumentMeta', () => {
  it('writes only what it was given and leaves the rest as it was', () => {
    const id = addNote('a document');

    setDocumentMeta(client, id, { mode: 'document', origin: 'person' });
    setDocumentMeta(client, id, { kind: 'draft' });

    expect(getDocumentMeta(client, id)).toMatchObject({
      mode: 'document',
      origin: 'person',
      kind: 'draft',
    });
  });

  it('returns what it wrote', () => {
    const id = addNote('a document');
    expect(setDocumentMeta(client, id, { writingStatus: 'working' }).writingStatus).toBe('working');
  });

  // An AI edit a person accepted does not make the person the author of the
  // original. Origin is the first source and later contribution lives on the
  // revision's actor.
  it('keeps the first origin when a later write does not name one', () => {
    const id = addNote('an imported file');
    setDocumentMeta(client, id, { origin: 'external' });

    setDocumentMeta(client, id, { writingStatus: 'finished' });

    expect(getDocumentMeta(client, id).origin).toBe('external');
  });
});

describe('the migration that adds it', () => {
  it('stamps the database at the new version', () => {
    expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(28);
  });

  it('runs again over an already migrated database without complaint', () => {
    const id = addNote('a note that must survive');
    setDocumentMeta(client, id, { kind: 'reference' });
    client.sqlite.prepare("DELETE FROM index_meta WHERE key = 'schema_version'").run();
    client.sqlite.close();

    client = openDb(dir);

    expect(getDocumentMeta(client, id).kind).toBe('reference');
    const note = client.sqlite.prepare('SELECT id, title FROM notes WHERE id = ?').get(id);
    expect(note).toMatchObject({ id, title: 'a note that must survive' });
  });
});
