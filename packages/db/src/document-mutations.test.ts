import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  commitMutation,
  failMutation,
  findMutation,
  preparedMutations,
  prepareMutation,
} from './document-mutations.ts';

let dir: string;
let client: MemexClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-doc-mutations-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the write journal', () => {
  it('remembers what a write was about to do', () => {
    prepareMutation(client, {
      mutationId: 'm-1',
      documentId: 7,
      expectedRevision: 'r-0',
      intendedHash: 'abc',
    });

    expect(findMutation(client, 'm-1')).toMatchObject({
      documentId: 7,
      expectedRevision: 'r-0',
      intendedHash: 'abc',
      stage: 'prepared',
      resultRevision: null,
    });
  });

  it('closes it with the revision the write produced', () => {
    prepareMutation(client, { mutationId: 'm-1', documentId: 7, intendedHash: 'abc' });
    commitMutation(client, 'm-1', 'r-1');

    expect(findMutation(client, 'm-1')).toMatchObject({
      stage: 'committed',
      resultRevision: 'r-1',
    });
  });

  it('closes it with why it did not', () => {
    prepareMutation(client, { mutationId: 'm-1', documentId: 7, intendedHash: 'abc' });
    failMutation(client, 'm-1', 'EACCES');

    expect(findMutation(client, 'm-1')).toMatchObject({ stage: 'failed', error: 'EACCES' });
  });

  // The one the recovery pass reads on startup: a write that got as far as
  // saying what it would do and never said whether it did.
  it('lists what was left open, and nothing that was finished', () => {
    prepareMutation(client, { mutationId: 'open', documentId: 7, intendedHash: 'abc' });
    prepareMutation(client, { mutationId: 'done', documentId: 8, intendedHash: 'def' });
    commitMutation(client, 'done', 'r-1');

    expect(preparedMutations(client).map((m) => m.mutationId)).toEqual(['open']);
  });

  it('does not start the same mutation twice', () => {
    prepareMutation(client, { mutationId: 'm-1', documentId: 7, intendedHash: 'abc' });
    prepareMutation(client, { mutationId: 'm-1', documentId: 7, intendedHash: 'zzz' });

    expect(findMutation(client, 'm-1')?.intendedHash).toBe('abc');
    expect(preparedMutations(client)).toHaveLength(1);
  });

  it('has nothing to say about a mutation it never saw', () => {
    expect(findMutation(client, 'never')).toBeUndefined();
  });
});
