import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNote, insertNote, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFolder, isFileFailure, removeFolder } from './files.ts';

let dbDir: string;
let vault: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-folders-'));
  vault = mkdtempSync(join(tmpdir(), 'memex-vault-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vault, { recursive: true, force: true });
});

const addNote = (folder: string, title: string) => {
  const at = join(vault, folder);
  mkdirSync(at, { recursive: true });
  const filePath = join(at, `${title}.md`);
  writeFileSync(filePath, `body of ${title}`);
  return insertNote(client, {
    title,
    content: `body of ${title}`,
    filePath,
    source: 'manual',
    layer: 'state',
    author: 'person',
    category: folder,
  }).id;
};

describe('createFolder', () => {
  it('makes a folder that holds nothing yet', () => {
    const made = createFolder(vault, '', 'projects');
    expect(isFileFailure(made)).toBe(false);
    expect(existsSync(join(vault, 'projects'))).toBe(true);
  });

  it('makes it inside the folder that was asked for', () => {
    mkdirSync(join(vault, 'projects'), { recursive: true });
    createFolder(vault, 'projects', 'memex');
    expect(existsSync(join(vault, 'projects', 'memex'))).toBe(true);
  });

  it('refuses a name already taken, rather than opening what is there', () => {
    mkdirSync(join(vault, 'projects'), { recursive: true });
    const again = createFolder(vault, '', 'projects');
    expect(isFileFailure(again) && again.error).toBe('name-taken');
  });

  it('refuses a name that is nothing once the filesystem has had its say', () => {
    const made = createFolder(vault, '', '..');
    expect(isFileFailure(made) && made.error).toBe('empty-name');
    expect(existsSync(join(vault, '..', 'x'))).toBe(false);
  });

  // A name arrives as free text, and `join` follows whatever it says.
  it('cannot be talked into walking out of the vault', () => {
    createFolder(vault, '', '../escaped');
    expect(existsSync(join(vault, '..', 'escaped'))).toBe(false);
  });
});

describe('removeFolder', () => {
  it('takes the notes inside with it, files and rows both', async () => {
    const id = addNote('projects', 'a plan');
    const filePath = join(vault, 'projects', 'a plan.md');

    const gone = await removeFolder(client, vault, 'projects');
    expect(isFileFailure(gone) ? null : gone.removed).toBe(1);
    expect(existsSync(filePath)).toBe(false);
    expect(getNote(client, id)).toBeUndefined();
  });

  it('reaches all the way down, not just the folder named', async () => {
    addNote('projects', 'a plan');
    addNote('projects/memex', 'another plan');

    const gone = await removeFolder(client, vault, 'projects');
    expect(isFileFailure(gone) ? null : gone.removed).toBe(2);
  });

  // The sibling is the test: a prefix match on the string would take it too.
  it('leaves a folder whose name merely starts the same', async () => {
    const kept = addNote('projects-old', 'an old plan');
    addNote('projects', 'a plan');

    await removeFolder(client, vault, 'projects');
    expect(getNote(client, kept)?.id).toBe(kept);
    expect(existsSync(join(vault, 'projects-old'))).toBe(true);
  });

  it('will not delete the vault itself', async () => {
    const gone = await removeFolder(client, vault, '');
    expect(isFileFailure(gone) && gone.error).toBe('read-only');
    expect(existsSync(vault)).toBe(true);
  });

  // The desktop hands the folder to the trash instead of unlinking it. What
  // matters here is that it is handed over once, whole, and that the rows go
  // only after it did.
  it('hands the whole folder to the discard it was given, not a file at a time', async () => {
    const id = addNote('projects', 'a plan');
    const handed: string[] = [];

    const gone = await removeFolder(client, vault, 'projects', async (at) => {
      handed.push(at);
    });

    expect(handed).toEqual([join(vault, 'projects')]);
    expect(isFileFailure(gone) ? null : gone.removed).toBe(1);
    expect(getNote(client, id)).toBeUndefined();
    // Nothing unlinked it, because that was the discard's job.
    expect(existsSync(join(vault, 'projects', 'a plan.md'))).toBe(true);
  });

  it('keeps the rows when the discard fails, so nothing is lost twice', async () => {
    const id = addNote('projects', 'a plan');

    await expect(
      removeFolder(client, vault, 'projects', () => {
        throw new Error('the trash said no');
      }),
    ).rejects.toThrow('the trash said no');
    expect(getNote(client, id)?.id).toBe(id);
  });

  it('says so when the folder is not there', async () => {
    const gone = await removeFolder(client, vault, 'never-existed');
    expect(isFileFailure(gone) && gone.error).toBe('missing-folder');
  });
});
