import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MemexClient } from '@memex/db';
import { expandPath, inVault, loadConfig } from '@memex/utils';

export type { Writer } from './authorship.ts';

import { type Writer, writerOf } from './authorship.ts';

export type TreeNote = { id: number; title: string; writer: Writer };

export type TreeFolder = { path: string; name: string; depth: number; count: number };

// memex reads from more than one place. The vault is the one it owns and can
// write back to; a source is borrowed — memex indexes it, and the tool that
// wrote it will write it again. Mixing them into one tree hid that difference
// behind identical folder rows.
export type VaultRoot = {
  id: string;
  name: string;
  path: string;
  writable: boolean;
  folders: TreeFolder[];
  notes: Record<string, TreeNote[]>;
  count: number;
};

export type VaultTree = { roots: VaultRoot[] };

type Row = { id: number; title: string; folder: string; source: string; filePath: string };

// A folder memex owns is a place on disk, not a grouping of rows. One made and
// left empty has to survive until something is put in it, so the vault is read
// as it sits rather than inferred from where the notes ended up.
const dirsIn = (root: string): string[] => {
  const walk = (at: string, prefix: string): string[] =>
    readdirSync(at, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .flatMap((entry) => {
        const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        return [path, ...walk(join(at, entry.name), path)];
      });
  return existsSync(root) ? walk(root, '') : [];
};

const foldersOf = (notes: Record<string, TreeNote[]>, onDisk: string[] = []): TreeFolder[] => {
  const paths = new Set<string>(onDisk);
  for (const folder of Object.keys(notes)) {
    if (folder === '') continue;
    const parts = folder.split('/');
    for (let at = 1; at <= parts.length; at += 1) paths.add(parts.slice(0, at).join('/'));
  }
  return [...paths].sort().map((path) => {
    const parts = path.split('/');
    return {
      path,
      name: parts[parts.length - 1] ?? path,
      depth: parts.length - 1,
      // What the folder holds all the way down, which is what a collapsed row
      // has to answer for.
      count: Object.entries(notes)
        .filter(([at]) => at === path || at.startsWith(`${path}/`))
        .reduce((sum, [, list]) => sum + list.length, 0),
    };
  });
};

const group = (rows: Row[]): Record<string, TreeNote[]> =>
  rows.reduce<Record<string, TreeNote[]>>((acc, row) => {
    acc[row.folder] = [
      ...(acc[row.folder] ?? []),
      {
        id: row.id,
        title: row.title,
        writer: writerOf(row.source),
      },
    ];
    return acc;
  }, {});

const nameOf = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path;

export const buildTree = (client: MemexClient): VaultTree => {
  const config = loadConfig();
  const vault = expandPath(config.vault_path);
  // A source nested inside another source would claim the same files twice, so
  // the longest path wins and shorter ones only keep what is left.
  const sources = config.sources
    .map((source) => expandPath(source.path))
    .sort((a, b) => b.length - a.length);

  const rows = client.sqlite
    .prepare(
      `SELECT id, title, COALESCE(category, '') AS folder, source, file_path AS filePath
       FROM notes ORDER BY folder, title`,
    )
    .all() as Row[];

  const homeOf = (row: Row) =>
    inVault(row.filePath, vault)
      ? vault
      : (sources.find((at) => inVault(row.filePath, at)) ?? null);

  const roots = [vault, ...sources].flatMap((path): VaultRoot[] => {
    const mine = rows.filter((row) => homeOf(row) === path);
    if (mine.length === 0 && path !== vault) return [];
    const notes = group(mine);
    return [
      {
        id: path,
        name: nameOf(path),
        path,
        writable: path === vault,
        folders: foldersOf(notes, path === vault ? dirsIn(path) : []),
        notes,
        count: mine.length,
      },
    ];
  });

  return { roots };
};
