import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { getDocumentMeta } from './document-meta.ts';
import {
  currentRevision,
  getRevision,
  hashOf,
  listRevisions,
  recordRevision,
} from './document-revisions.ts';

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
  dir = mkdtempSync(join(tmpdir(), 'memex-doc-revisions-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('recordRevision', () => {
  it('gives the first revision no parent and makes it current', () => {
    const id = addNote('a document');

    const first = recordRevision(client, {
      documentId: id,
      rawContent: '# a document\n\nfirst\n',
      actor: 'user',
    });

    expect(first.parentRevision).toBeNull();
    expect(currentRevision(client, id)?.revisionId).toBe(first.revisionId);
    expect(getDocumentMeta(client, id).currentRevision).toBe(first.revisionId);
  });

  it('chains each revision to the one it was written on top of', () => {
    const id = addNote('a document');

    const first = recordRevision(client, { documentId: id, rawContent: 'one', actor: 'user' });
    const second = recordRevision(client, { documentId: id, rawContent: 'two', actor: 'user' });

    expect(second.parentRevision).toBe(first.revisionId);
    expect(listRevisions(client, id).map((r) => r.revisionId)).toEqual([
      second.revisionId,
      first.revisionId,
    ]);
  });

  // The whole file, frontmatter included. A revision that only kept the body
  // could not restore the document it came from.
  it('keeps the raw file, not the part the screen shows', () => {
    const id = addNote('a document');
    const raw = '---\ntitle: a document\ncssclass: wide\n---\n\nbody\n';

    const saved = recordRevision(client, { documentId: id, rawContent: raw, actor: 'user' });

    expect(getRevision(client, saved.revisionId)?.rawContent).toBe(raw);
  });

  it('stamps the hash of what it stored', () => {
    const id = addNote('a document');
    const saved = recordRevision(client, { documentId: id, rawContent: 'body', actor: 'user' });

    expect(saved.fileHash).toBe(hashOf('body'));
  });

  it('records who wrote it and why, when there is a why', () => {
    const id = addNote('a document');

    const saved = recordRevision(client, {
      documentId: id,
      rawContent: 'body',
      actor: 'agent',
      reason: 'applied a proposal',
    });

    expect(saved).toMatchObject({ actor: 'agent', reason: 'applied a proposal' });
  });

  // A retry is not a second edit. The client that lost the response and sent it
  // again must get the revision the first call made, not a duplicate beside it.
  it('returns the revision a repeated mutationId already made', () => {
    const id = addNote('a document');

    const first = recordRevision(client, {
      documentId: id,
      rawContent: 'body',
      actor: 'user',
      mutationId: 'm-1',
    });
    const again = recordRevision(client, {
      documentId: id,
      rawContent: 'body written differently',
      actor: 'user',
      mutationId: 'm-1',
    });

    expect(again.revisionId).toBe(first.revisionId);
    expect(again.rawContent).toBe('body');
    expect(listRevisions(client, id)).toHaveLength(1);
  });

  it('lets two different mutations through', () => {
    const id = addNote('a document');
    recordRevision(client, { documentId: id, rawContent: 'a', actor: 'user', mutationId: 'm-1' });
    recordRevision(client, { documentId: id, rawContent: 'b', actor: 'user', mutationId: 'm-2' });

    expect(listRevisions(client, id)).toHaveLength(2);
  });

  it('does not confuse two documents that were saved by the same client', () => {
    const one = addNote('one');
    const two = addNote('two');

    recordRevision(client, { documentId: one, rawContent: 'a', actor: 'user' });
    recordRevision(client, { documentId: two, rawContent: 'b', actor: 'user' });

    expect(currentRevision(client, one)?.rawContent).toBe('a');
    expect(currentRevision(client, two)?.rawContent).toBe('b');
  });
});

describe('currentRevision', () => {
  it('is nothing at all for a document nobody has saved', () => {
    expect(currentRevision(client, addNote('untouched'))).toBeUndefined();
  });
});
