import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

const BACKUP = /^memex\.db\.bak-\d{8}-\d{6}$/;

export const BACKUPS_KEPT = 3;

const two = (n: number) => String(n).padStart(2, '0');

const stamp = (at: Date): string =>
  `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(
    at.getMinutes(),
  )}${two(at.getSeconds())}`;

export const backupName = (at: Date): string => `memex.db.bak-${stamp(at)}`;

// `VACUUM INTO` rather than copying the file: the database runs in WAL mode with
// the app, the MCP server and the CLI all attached, and a copy taken through the
// filesystem can be torn halfway through someone else's transaction. This is a
// consistent snapshot taken by SQLite itself, and it compacts on the way out.
export const backupDb = (
  sqlite: Database.Database,
  dbDir: string,
  at: Date = new Date(),
): string => {
  const path = join(dbDir, backupName(at));
  // The name is the second it was taken in, so a second snapshot inside the
  // same second is the same snapshot. `VACUUM INTO` refuses to overwrite, and
  // that refusal must not read as a failure.
  if (existsSync(path)) return path;
  sqlite.prepare('VACUUM INTO ?').run(path);
  return path;
};

export const listBackups = (dbDir: string): string[] =>
  readdirSync(dbDir)
    .filter((name) => BACKUP.test(name))
    .sort()
    .reverse();

export const pruneBackups = (dbDir: string, keep: number = BACKUPS_KEPT): string[] => {
  const stale = listBackups(dbDir).slice(keep);
  for (const name of stale) rmSync(join(dbDir, name), { force: true });
  return stale;
};

// A snapshot that cannot be taken — no room on the disk, a directory that is
// not writable — is a worse backup, not a worse database. Refusing to open the
// vault over it would turn a safety measure into the thing that loses access to
// everything. `memex stats` prints when the newest one was taken, which is
// where a run of failures becomes visible.
export const snapshotBeforeSchemaChange = (sqlite: Database.Database, dbDir: string): boolean => {
  try {
    backupDb(sqlite, dbDir);
    pruneBackups(dbDir);
    return true;
  } catch {
    return false;
  }
};
