import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { addReference, dropReference, referencesFor } from './document-references.ts';
import { recordRevision } from './document-revisions.ts';

let dir: string;
let client: MemexClient;

const addNote = (title: string) => {
  const row = client.sqlite
    .prepare(
      `INSERT INTO notes (title, content, file_path, created_at, updated_at)
       VALUES (?, 'body', ?, 1, 1) RETURNING id`,
    )
    .get(title, join(dir, `${title}.md`)) as { id: number };
  return row.id;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-doc-refs-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('document references', () => {
  it('points at the source rather than copying it', () => {
    const owner = addNote('원고');
    const source = addNote('인터뷰 메모');

    const ref = addReference(client, {
      ownerDocumentId: owner,
      sourceDocumentId: source,
      quote: '도구를 바꾸면 일이 빨라질 거라고',
    });

    expect(ref).toMatchObject({ sourceDocumentId: source, title: '인터뷰 메모' });
    expect(
      client.sqlite.prepare('SELECT content FROM notes WHERE id = ?').get(owner),
    ).toMatchObject({ content: 'body' });
  });

  // Finding the same passage again is finding the same thing. A list that grew a
  // row every time is a list nobody reads.
  it('is one reference however many times the same source is added', () => {
    const owner = addNote('원고');
    const source = addNote('인터뷰 메모');

    addReference(client, { ownerDocumentId: owner, sourceDocumentId: source, quote: '처음' });
    addReference(client, { ownerDocumentId: owner, sourceDocumentId: source, quote: '나중' });

    const refs = referencesFor(client, owner);
    expect(refs).toHaveLength(1);
    expect(refs[0].quote).toBe('나중');
  });

  it('remembers the version it was quoting', () => {
    const owner = addNote('원고');
    const source = addNote('인터뷰 메모');
    const at = recordRevision(client, { documentId: source, rawContent: 'one', actor: 'user' });

    expect(
      addReference(client, { ownerDocumentId: owner, sourceDocumentId: source }),
    ).toMatchObject({ sourceRevision: at.revisionId, state: 'current' });
  });

  // The whole reason a reference carries a version: a month later it can say the
  // thing you quoted is not what it says now.
  it('says so when the source moved on', () => {
    const owner = addNote('원고');
    const source = addNote('인터뷰 메모');
    recordRevision(client, { documentId: source, rawContent: 'one', actor: 'user' });
    addReference(client, { ownerDocumentId: owner, sourceDocumentId: source });
    recordRevision(client, { documentId: source, rawContent: 'two', actor: 'user' });

    expect(referencesFor(client, owner)[0].state).toBe('changed');
  });

  it('says so when the source is gone', () => {
    const owner = addNote('원고');
    const source = addNote('인터뷰 메모');
    addReference(client, { ownerDocumentId: owner, sourceDocumentId: source });
    client.sqlite.prepare('DELETE FROM notes WHERE id = ?').run(source);

    expect(referencesFor(client, owner)[0]).toMatchObject({ state: 'missing', title: null });
  });

  it('does not call a source memex never saved a changed one', () => {
    const owner = addNote('원고');
    const source = addNote('인터뷰 메모');

    expect(referencesFor(client, addNote('빈 원고'))).toEqual([]);
    addReference(client, { ownerDocumentId: owner, sourceDocumentId: source });
    expect(referencesFor(client, owner)[0].state).toBe('current');
  });

  it('lets go of one', () => {
    const owner = addNote('원고');
    const source = addNote('인터뷰 메모');
    addReference(client, { ownerDocumentId: owner, sourceDocumentId: source });

    dropReference(client, owner, source);

    expect(referencesFor(client, owner)).toEqual([]);
  });

  it('keeps one document’s references out of another’s', () => {
    const mine = addNote('내 원고');
    const yours = addNote('다른 원고');
    const source = addNote('인터뷰 메모');
    addReference(client, { ownerDocumentId: mine, sourceDocumentId: source });

    expect(referencesFor(client, yours)).toEqual([]);
  });
});
