import type { MemexClient } from '@memex/db';
import { expandPath, inVault, loadConfig } from '@memex/utils';

// Who put the note there. `claude-code` is memex's own write path; `manual` is
// someone typing in the app; anything else is a file that appeared without going
// through either — written in another editor.
export type Writer = 'agent' | 'person';

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

const foldersOf = (notes: Record<string, TreeNote[]>): TreeFolder[] => {
  const paths = new Set<string>();
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
        writer: row.source === 'claude-code' ? 'agent' : 'person',
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
        folders: foldersOf(notes),
        notes,
        count: mine.length,
      },
    ];
  });

  return { roots };
};
