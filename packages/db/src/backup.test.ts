import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupDb,
  backupName,
  listBackups,
  pruneBackups,
  snapshotBeforeSchemaChange,
} from './backup.ts';
import { openDb } from './client.ts';
import { countNotes, insertNote } from './repository.ts';

describe('backups', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-backup-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const at = (iso: string) => new Date(iso);

  it('names a backup after the moment it was taken', () => {
    expect(backupName(at('2026-09-04T07:05:03'))).toBe('memex.db.bak-20260904-070503');
  });

  it('takes a snapshot that opens as a database of its own', () => {
    const client = openDb(dir);
    insertNote(client, {
      title: 'a note',
      content: 'a body long enough to be a note',
      filePath: join(dir, 'a.md'),
      source: 'manual',
      layer: 'past',
    });

    const path = backupDb(client.sqlite, dir);
    client.sqlite.close();
    expect(existsSync(path)).toBe(true);

    const restored = mkdtempSync(join(tmpdir(), 'memex-restored-'));
    copyFileSync(path, join(restored, 'memex.db'));
    const copy = openDb(restored);
    expect(countNotes(copy)).toBe(1);
    copy.sqlite.close();
    rmSync(restored, { recursive: true, force: true });
  });

  it('treats a second snapshot inside the same second as the one already taken', () => {
    const client = openDb(dir);
    insertNote(client, {
      title: 'a note',
      content: 'a body long enough to be a note',
      filePath: join(dir, 'a.md'),
      source: 'manual',
      layer: 'past',
    });
    const at = new Date('2026-09-04T07:05:03');

    expect(backupDb(client.sqlite, dir, at)).toBe(backupDb(client.sqlite, dir, at));
    expect(listBackups(dir)).toHaveLength(1);
    client.sqlite.close();
  });

  it('does not let a snapshot it cannot take become an error', () => {
    const client = openDb(dir);
    insertNote(client, {
      title: 'a note',
      content: 'a body long enough to be a note',
      filePath: join(dir, 'a.md'),
      source: 'manual',
      layer: 'past',
    });

    expect(snapshotBeforeSchemaChange(client.sqlite, join(dir, 'no', 'such', 'place'))).toBe(false);
    expect(snapshotBeforeSchemaChange(client.sqlite, dir)).toBe(true);
    client.sqlite.close();
  });

  const touch = (name: string) => writeFileSync(join(dir, name), '');

  it('lists backups newest first and ignores anything else in the directory', () => {
    touch('memex.db.bak-20260901-120000');
    touch('memex.db.bak-20260904-070503');
    touch('memex.db.bak-20260902-235959');
    touch('memex.db');
    touch('memex.db.bak-20260901-120000-wal');
    touch('memex.db.bak-nope');

    expect(listBackups(dir)).toEqual([
      'memex.db.bak-20260904-070503',
      'memex.db.bak-20260902-235959',
      'memex.db.bak-20260901-120000',
    ]);
  });

  it('keeps the newest and deletes the rest', () => {
    for (const day of ['01', '02', '03', '04', '05']) touch(`memex.db.bak-202609${day}-120000`);

    expect(pruneBackups(dir, 2)).toEqual([
      'memex.db.bak-20260903-120000',
      'memex.db.bak-20260902-120000',
      'memex.db.bak-20260901-120000',
    ]);
    expect(listBackups(dir)).toEqual([
      'memex.db.bak-20260905-120000',
      'memex.db.bak-20260904-120000',
    ]);
  });

  it('deletes nothing when there are fewer backups than it keeps', () => {
    touch('memex.db.bak-20260904-120000');
    expect(pruneBackups(dir, 3)).toEqual([]);
    expect(listBackups(dir)).toHaveLength(1);
  });
});

describe('openDb backs up before it migrates', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-premigrate-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const backups = () => readdirSync(dir).filter((f) => f.startsWith('memex.db.bak-'));

  it('leaves a fresh vault alone — an empty database has nothing to lose', () => {
    const client = openDb(dir);
    expect(backups()).toEqual([]);
    client.sqlite.close();
  });

  it('snapshots a vault with notes in it before a pending step runs', () => {
    const first = openDb(dir);
    insertNote(first, {
      title: 'a note',
      content: 'a body long enough to be a note',
      filePath: join(dir, 'a.md'),
      source: 'manual',
      layer: 'past',
    });
    // Rewind the stamp so the next open has work to do.
    first.sqlite.prepare("UPDATE index_meta SET value = '17' WHERE key = 'schema_version'").run();
    first.sqlite.close();

    const second = openDb(dir);
    expect(backups()).toHaveLength(1);
    second.sqlite.close();

    // Nothing pending, nothing taken.
    const third = openDb(dir);
    expect(backups()).toHaveLength(1);
    third.sqlite.close();
  });
});
