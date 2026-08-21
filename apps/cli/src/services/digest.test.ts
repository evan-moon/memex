import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  insertNote,
  type MemexClient,
  type NoteLayer,
  openDb,
  serializeTags,
  upsertSignal,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDigest } from './digest.ts';

const DAY = 86_400_000;

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-digest-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, category: string | null, layer: NoteLayer = 'past') =>
  insertNote(client, {
    title,
    content: 'body',
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer,
    category,
    tags: serializeTags(['t']),
    authoredAt: Date.now(),
  });

// Detection retires any open signal it no longer finds, so a hand-made one
// only survives a later read if the corpus has already been detected against.
const primeSignalDetection = () => buildDigest(client, { days: 1 });

const backdate = (id: number, days: number) =>
  client.sqlite
    .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
    .run(Date.now() - days * DAY, id);

describe('buildDigest', () => {
  it('groups what came in by folder, fullest first', () => {
    addNote('a', 'projects');
    addNote('b', 'projects');
    addNote('c', 'work');
    addNote('d', null);

    const digest = buildDigest(client, { days: 7 });
    expect(digest.total).toBe(4);
    expect(digest.folders.map((f) => [f.folder, f.notes.length])).toEqual([
      ['projects', 2],
      ['(root)', 1],
      ['work', 1],
    ]);
  });

  it('counts only what landed inside the window', () => {
    addNote('recent', 'projects');
    backdate(addNote('old', 'projects').id, 30);

    expect(buildDigest(client, { days: 7 }).total).toBe(1);
    expect(buildDigest(client, { days: 60 }).total).toBe(2);
  });

  it('says nothing came in rather than inventing a folder', () => {
    const digest = buildDigest(client, { days: 7 });
    expect(digest.total).toBe(0);
    expect(digest.folders).toEqual([]);
  });

  it('puts the state note with the most piled up behind it first', () => {
    const light = addNote('light', 'projects', 'state');
    const heavy = addNote('heavy', 'projects', 'state');
    const records = [addNote('r1', 'work'), addNote('r2', 'work'), addNote('r3', 'work')];
    primeSignalDetection();

    upsertSignal(client, {
      type: 'stale_state',
      evidenceIds: [light.id, records[0].id],
      reasoning: 'one',
    });
    upsertSignal(client, {
      type: 'stale_state',
      evidenceIds: [heavy.id, ...records.map((r) => r.id)],
      reasoning: 'three',
    });

    const { attention } = buildDigest(client, { days: 7 });
    expect(attention.map((a) => [a.title, a.count])).toEqual([
      ['heavy', 3],
      ['light', 1],
    ]);
  });

  it('leaves attention empty when nothing is waiting', () => {
    addNote('a', 'projects');
    expect(buildDigest(client, { days: 7 }).attention).toEqual([]);
  });

  it('offers no connection when nothing has been embedded', () => {
    addNote('a', 'projects');
    expect(buildDigest(client, { days: 7 }).connection).toBeNull();
  });
});
