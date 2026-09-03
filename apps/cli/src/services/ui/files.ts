import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { getNote, type MemexClient } from '@memex/db';
import { inVault, sanitizeFilename, sanitizeFolder } from '@memex/utils';

export type FileFailure = { error: string; message: string };

const isFailure = (value: unknown): value is FileFailure =>
  typeof value === 'object' && value !== null && 'error' in value;

export const isFileFailure = isFailure;

// A name that is free. Adding a number rather than overwriting is the whole
// point of duplicating, and a loop that gives up beats one that never ends.
const freePath = (path: string): string | null => {
  if (!existsSync(path)) return path;
  const dir = dirname(path);
  const ext = extname(path);
  const stem = basename(path, ext);
  for (let n = 2; n < 100; n += 1) {
    const candidate = join(dir, `${stem} ${n}${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  return null;
};

// The row the index keeps is the file's address, so moving the file without
// telling it leaves a note pointing at nothing. Both happen here or neither.
const relocate = (client: MemexClient, id: number, from: string, to: string) => {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
  client.sqlite.prepare('UPDATE notes SET file_path = ? WHERE id = ?').run(to, id);
};

// A folder has no row of its own — it exists because notes are in it. So the
// path is worked out from any note it holds rather than looked up.
export const folderPath = (root: string, folder: string): string | FileFailure => {
  const safe = sanitizeFolder(folder);
  const target = safe === '' ? root : join(root, safe);
  return existsSync(target)
    ? target
    : { error: 'missing-folder', message: `${target} is not on disk.` };
};

export const revealPath = (client: MemexClient, id: number): string | FileFailure => {
  const note = getNote(client, id);
  if (!note) return { error: 'not-found', message: `#${id} is not a note.` };
  if (!existsSync(note.filePath)) {
    return { error: 'missing-file', message: `${note.filePath} is not on disk any more.` };
  }
  return note.filePath;
};

export const duplicateNote = (
  client: MemexClient,
  id: number,
  vaultPath: string,
): { path: string } | FileFailure => {
  const note = getNote(client, id);
  if (!note) return { error: 'not-found', message: `#${id} is not a note.` };
  // A copy of a borrowed file would land in someone else's repository, so a
  // duplicate is only offered where memex owns the shelf.
  if (!inVault(note.filePath, vaultPath)) {
    return { error: 'read-only', message: 'That file lives outside the vault.' };
  }
  const ext = extname(note.filePath);
  const target = freePath(join(dirname(note.filePath), `${basename(note.filePath, ext)} 2${ext}`));
  if (target === null) return { error: 'no-name', message: 'Could not find a free name.' };
  copyFileSync(note.filePath, target);
  return { path: target };
};

// Moving is the one thing that crosses vaults on purpose: an agent writes a
// draft where it is allowed to write, and a person carries it out to the repo
// that publishes it.
export const moveNote = (
  client: MemexClient,
  id: number,
  folder: string,
): { path: string } | FileFailure => {
  const note = getNote(client, id);
  if (!note) return { error: 'not-found', message: `#${id} is not a note.` };
  const target = freePath(join(folder, basename(note.filePath)));
  if (target === null) return { error: 'no-name', message: 'Could not find a free name.' };
  if (target === note.filePath) return { path: target };
  relocate(client, id, note.filePath, target);
  return { path: target };
};

// The filename is the title here, so renaming one renames the other. The body
// is left alone: only the file's name and the row's title move.
export const renameNote = (
  client: MemexClient,
  id: number,
  title: string,
  vaultPath: string,
): { path: string; title: string } | FileFailure => {
  const note = getNote(client, id);
  if (!note) return { error: 'not-found', message: `#${id} is not a note.` };
  if (!inVault(note.filePath, vaultPath)) {
    return { error: 'read-only', message: 'That file lives outside the vault.' };
  }
  const clean = title.trim();
  if (clean === '') return { error: 'empty-title', message: 'A note needs a name.' };
  const target = join(dirname(note.filePath), `${sanitizeFilename(clean) || 'untitled'}.md`);
  if (target !== note.filePath) {
    const free = freePath(target);
    if (free === null || free !== target) {
      return { error: 'name-taken', message: `${clean} already exists in that folder.` };
    }
    relocate(client, id, note.filePath, target);
  }
  client.sqlite.prepare('UPDATE notes SET title = ? WHERE id = ?').run(clean, id);
  return { path: target, title: clean };
};
