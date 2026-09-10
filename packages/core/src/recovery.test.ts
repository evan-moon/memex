import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  currentRevision,
  findMutation,
  hashOf,
  listRevisions,
  type MemexClient,
  openDb,
  prepareMutation,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument, type DocumentContext } from './documents.ts';
import { recoverInterruptedWrites } from './recovery.ts';

let dbDir: string;
let vault: string;
let client: MemexClient;

const user = (): DocumentContext => ({ actor: 'user', vaultPath: vault });

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-recovery-db-'));
  vault = mkdtempSync(join(tmpdir(), 'memex-recovery-vault-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vault, { recursive: true, force: true });
});

const make = () => {
  const made = createDocument(client, { title: '원고', raw: '처음 쓴 것\n' }, user());
  if ('error' in made) throw new Error('setup failed');
  return made;
};

const filePath = () => join(vault, '원고.md');

// The process died between saying what it would do and saying whether it did.
// Everything below starts from that state.
const interrupted = (documentId: number, intended: string, base: string | null) =>
  prepareMutation(client, {
    mutationId: 'm-interrupted',
    documentId,
    expectedRevision: base,
    intendedHash: hashOf(intended),
  });

describe('recoverInterruptedWrites', () => {
  it('has nothing to say when no write was in flight', () => {
    make();
    expect(recoverInterruptedWrites(client)).toEqual([]);
  });

  // The file still says what it said. The write never reached the disk, so
  // there is nothing to undo and nothing to record.
  it('calls a write that never reached the disk exactly that', () => {
    const made = make();
    interrupted(made.id, '쓰려던 것\n', made.revision);

    const found = recoverInterruptedWrites(client);

    expect(found).toMatchObject([{ outcome: 'never-happened' }]);
    expect(readFileSync(filePath(), 'utf8')).toBe('처음 쓴 것\n');
    expect(findMutation(client, 'm-interrupted')?.stage).toBe('failed');
  });

  // The disk half finished and the database half did not. What is on disk is
  // what was meant, so the database catches up rather than the file going back.
  it('records the version for a write the disk finished alone', () => {
    const made = make();
    const intended = '쓰려던 것\n';
    interrupted(made.id, intended, made.revision);
    writeFileSync(filePath(), intended, 'utf8');

    const found = recoverInterruptedWrites(client);

    expect(found).toMatchObject([{ outcome: 'landed' }]);
    expect(currentRevision(client, made.id)?.rawContent).toBe(intended);
    expect(findMutation(client, 'm-interrupted')?.stage).toBe('committed');
  });

  // Neither. Somebody else wrote the file while this was in flight, and what is
  // there is theirs — replaying over it is how an edit disappears.
  it('keeps what overtook the write instead of replaying over it', () => {
    const made = make();
    interrupted(made.id, '쓰려던 것\n', made.revision);
    writeFileSync(filePath(), '다른 편집기가 쓴 것\n', 'utf8');

    const found = recoverInterruptedWrites(client);

    expect(found).toMatchObject([{ outcome: 'overtaken' }]);
    expect(readFileSync(filePath(), 'utf8')).toBe('다른 편집기가 쓴 것\n');
    expect(listRevisions(client, made.id).some((r) => r.actor === 'external')).toBe(true);
    expect(findMutation(client, 'm-interrupted')?.stage).toBe('failed');
  });

  it('does not choke on a document that is gone', () => {
    const made = make();
    interrupted(made.id, '쓰려던 것\n', made.revision);
    unlinkSync(filePath());

    expect(recoverInterruptedWrites(client)).toMatchObject([{ outcome: 'never-happened' }]);
  });

  // Running it twice must not produce a second answer, because the first run
  // closed every journal entry it read.
  it('has nothing left to do on a second pass', () => {
    const made = make();
    const intended = '쓰려던 것\n';
    interrupted(made.id, intended, made.revision);
    writeFileSync(filePath(), intended, 'utf8');

    recoverInterruptedWrites(client);

    expect(recoverInterruptedWrites(client)).toEqual([]);
  });
});
