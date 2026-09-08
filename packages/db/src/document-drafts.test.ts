import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  dropDocumentDraft,
  getDocumentDraft,
  putDocumentDraft,
  unsavedDrafts,
} from './document-drafts.ts';

let dir: string;
let client: MemexClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-doc-drafts-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const put = (over: Partial<Parameters<typeof putDocumentDraft>[1]> = {}) =>
  putDocumentDraft(client, {
    draftKey: 'k-1',
    vaultId: 'vault-a',
    content: 'typed',
    sequence: 1,
    ...over,
  });

describe('document drafts', () => {
  it('keeps what the editor is holding', () => {
    put({ content: '반쯤 쓴 문단', documentId: 7, baseRevision: 'r-1' });

    expect(getDocumentDraft(client, 'k-1')).toMatchObject({
      content: '반쯤 쓴 문단',
      documentId: 7,
      baseRevision: 'r-1',
      sequence: 1,
    });
  });

  it('is keyed by something the editor made, not by an id it may not have yet', () => {
    put({ documentId: null });
    expect(getDocumentDraft(client, 'k-1')?.documentId).toBeNull();
  });

  it('moves forward as the person keeps typing', () => {
    put({ content: 'one', sequence: 1 });
    put({ content: 'two', sequence: 2 });

    expect(getDocumentDraft(client, 'k-1')).toMatchObject({ content: 'two', sequence: 2 });
  });

  // These are written from the tab still being typed in, and nothing under them
  // promises order. An older one landing late must not undo a newer one.
  it('refuses a sequence older than the one it already has', () => {
    put({ content: 'two', sequence: 2 });
    put({ content: 'one', sequence: 1 });

    expect(getDocumentDraft(client, 'k-1')).toMatchObject({ content: 'two', sequence: 2 });
  });

  it('is gone once the edit is really saved', () => {
    put();
    dropDocumentDraft(client, 'k-1');

    expect(getDocumentDraft(client, 'k-1')).toBeUndefined();
  });

  // What the app asks on the way back in after a crash.
  it('lists one vault’s unsaved work and nobody else’s', () => {
    put({ draftKey: 'a', vaultId: 'vault-a', content: 'mine' });
    put({ draftKey: 'b', vaultId: 'vault-b', content: 'another vault' });

    expect(unsavedDrafts(client, 'vault-a').map((d) => d.content)).toEqual(['mine']);
  });

  it('has nothing to report when everything was saved', () => {
    expect(unsavedDrafts(client, 'vault-a')).toEqual([]);
  });
});
