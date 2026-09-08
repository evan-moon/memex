import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getClaim, type MemexClient, openDb, readRegister, setRegister } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMemory, correctMemory, isCorrectionFailure, parseMemoryId } from './memory.ts';

let dir: string;
let client: MemexClient;

const addNote = (title: string, content: string) => {
  const row = client.sqlite
    .prepare(
      `INSERT INTO notes (title, content, file_path, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1) RETURNING id`,
    )
    .get(title, content, join(dir, `${title}.md`)) as { id: number };
  return row.id;
};

const addClaim = (noteId: number, text: string) => {
  const row = client.sqlite
    .prepare(
      `INSERT INTO note_claims (note_id, idx, text, source_hash, valid_from, status, kind)
       VALUES (?, 0, ?, '', 1, 'unconfirmed', 'state') RETURNING id`,
    )
    .get(noteId, text) as { id: number };
  return row.id;
};

const launchDate = (value: string, author: 'person' | 'agent' = 'agent') =>
  setRegister(client, {
    subject: '출시 계획',
    predicate: '출시 목표',
    value,
    scope: { kind: 'global' },
    author,
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-memory-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('parseMemoryId', () => {
  it('tells the two stores apart by the id it was given', () => {
    expect(parseMemoryId('claim:12')).toEqual({ kind: 'claim', id: 12 });
    expect(parseMemoryId('register:5')).toEqual({ kind: 'register', id: 5 });
    expect(parseMemoryId('nonsense')).toBeNull();
  });
});

describe('buildMemory', () => {
  // One list over two stores. Nobody looking for what memex believes should have
  // to know which mechanism it happens to be kept in.
  it('reads claims and the register through the same shape', () => {
    const note = addNote('출시 계획', '출시 목표는 9월이다');
    addClaim(note, '출시 목표는 9월이다');
    launchDate('9월');

    const everything = buildMemory(client);
    const subject = buildMemory(client, '출시 계획');

    expect(everything.items[0]).toMatchObject({ statement: '출시 목표는 9월이다' });
    expect(subject.items[0]).toMatchObject({
      statement: '출시 목표: 9월',
      subjectKey: '출시 계획',
    });
  });

  // A08's premise: an agent recording something is not the person confirming it.
  it('does not call what an agent recorded confirmed', () => {
    launchDate('9월', 'agent');
    expect(buildMemory(client, '출시 계획').items[0].status).toBe('unconfirmed');
  });

  it('calls what a person said confirmed', () => {
    launchDate('9월', 'person');
    expect(buildMemory(client, '출시 계획').items[0].status).toBe('confirmed');
  });
});

describe('correctMemory', () => {
  // A08. September becomes October, and the next read gets October.
  it('records the new value and hands the next read that one', () => {
    launchDate('9월');
    const before = buildMemory(client, '출시 계획').items[0];

    const done = correctMemory(client, {
      target: before.id,
      expectedStatement: before.statement,
      replacement: '10월',
      mutationId: 'm-1',
    });

    expect(isCorrectionFailure(done)).toBe(false);
    expect(buildMemory(client, '출시 계획').items[0]).toMatchObject({
      statement: '출시 목표: 10월',
      status: 'confirmed',
    });
  });

  // September is still what was believed in August. The history is why the
  // value is not deleted.
  it('leaves the old value in the history', () => {
    launchDate('9월');
    const before = buildMemory(client, '출시 계획').items[0];
    correctMemory(client, { target: before.id, replacement: '10월', mutationId: 'm-1' });

    const tips = readRegister(client, '출시 계획');
    expect(tips[0].events).toBeGreaterThan(1);
  });

  // Not knowing the new value must not stop somebody saying the old one is wrong.
  it('retires a memory with no replacement to put in its place', () => {
    const note = addNote('출시 계획', '출시 목표는 9월이다');
    const claim = addClaim(note, '출시 목표는 9월이다');

    const done = correctMemory(client, { target: `claim:${claim}`, mutationId: 'm-1' });

    expect(done).toMatchObject({ status: 'retired' });
    expect(getClaim(client, claim)?.status).toBe('retracted');
  });

  // A correction built on a value that has since changed is a correction of
  // something else.
  it('refuses when what it is correcting is not what it was shown', () => {
    const note = addNote('출시 계획', '출시 목표는 9월이다');
    const claim = addClaim(note, '출시 목표는 9월이다');

    const done = correctMemory(client, {
      target: `claim:${claim}`,
      expectedStatement: '출시 목표는 8월이다',
      replacement: '10월',
      mutationId: 'm-1',
    });

    expect(isCorrectionFailure(done)).toBe(true);
    expect(getClaim(client, claim)?.status).toBe('unconfirmed');
  });

  it('gives a repeated correction the answer the first one got', () => {
    launchDate('9월');
    const before = buildMemory(client, '출시 계획').items[0];
    const first = correctMemory(client, {
      target: before.id,
      replacement: '10월',
      mutationId: 'm-1',
    });
    const again = correctMemory(client, {
      target: before.id,
      replacement: '11월',
      mutationId: 'm-1',
    });

    expect(again).toEqual(first);
    expect(buildMemory(client, '출시 계획').items[0].statement).toBe('출시 목표: 10월');
  });

  it('says so for a memory that is not there', () => {
    expect(correctMemory(client, { target: 'claim:9999', mutationId: 'm-1' })).toMatchObject({
      error: 'not-found',
    });
  });

  it('says so for an id it cannot read', () => {
    expect(correctMemory(client, { target: 'nonsense', mutationId: 'm-1' })).toMatchObject({
      error: 'unknown-target',
    });
  });
});
