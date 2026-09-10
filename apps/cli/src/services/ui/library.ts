import {
  type DocumentKind,
  type DocumentOrigin,
  getDocumentMeta,
  type MemexClient,
} from '@memex/db';
import { inVault } from '@memex/utils';
import { isBorrowed, originOf } from './authorship.ts';

// What the library shows. The folders stay exactly as they are on disk — the
// design is explicit that connecting a folder does not rearrange it — and the
// only thing added on top is the one question a file tree cannot answer: what
// kind of document this is.
export type LibraryFilter = 'all' | 'mine' | 'reference' | 'instruction';

export type LibraryRow = {
  id: number;
  title: string;
  folder: string;
  kind: DocumentKind;
  // Shown so a row can be disagreed with. A guess nobody can see is a guess
  // nobody can correct.
  origin: DocumentOrigin;
  updatedAt: number;
  writingStatus: string | null;
};

export type LibraryPage = { rows: LibraryRow[]; counts: Record<LibraryFilter, number> };

type Row = {
  id: number;
  title: string;
  folder: string;
  updated_at: number;
  layer: string;
  source: string;
  file_path: string;
};

const kindOf = (declared: DocumentKind, layer: string): DocumentKind => {
  if (declared !== 'unknown') return declared;
  if (layer === 'rule') return 'instruction';
  if (layer === 'external') return 'reference';
  return 'unknown';
};

// Two axes, not one. Who wrote it and where it lives are different questions,
// so a blog post somebody wrote in a folder memex only reads is in both "mine"
// and "references" — which is true, and pretending otherwise is what made the
// sidebar and this screen disagree about the same file.
const matches = (
  filter: LibraryFilter,
  kind: DocumentKind,
  origin: DocumentOrigin,
  borrowed: boolean,
): boolean => {
  if (filter === 'all') return true;
  if (filter === 'mine') return origin === 'person';
  if (filter === 'reference') return kind === 'reference' || borrowed || origin === 'external';
  return kind === 'instruction';
};

export const buildLibrary = (
  client: MemexClient,
  filter: LibraryFilter = 'all',
  limit = 500,
  // Folders the person said hold somebody else's writing.
  referenceFolders: string[] = [],
): LibraryPage => {
  const rows = client.sqlite
    .prepare(
      `SELECT id, title, COALESCE(category, '') AS folder, updated_at, layer, source, file_path
       FROM notes ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as Row[];

  const enriched = rows.map((row) => {
    const meta = getDocumentMeta(client, row.id);
    const borrowedFolder = referenceFolders.some((root) => inVault(row.file_path, root));
    const origin = originOf(meta.origin, row.source, borrowedFolder);
    return {
      row: {
        id: row.id,
        title: row.title,
        folder: row.folder,
        kind: kindOf(meta.kind, row.layer),
        origin,
        updatedAt: row.updated_at,
        writingStatus: meta.writingStatus,
      },
      origin,
      borrowed: isBorrowed(row.layer),
    };
  });

  const counts = (['all', 'mine', 'reference', 'instruction'] as const).reduce(
    (acc, name) => ({
      ...acc,
      [name]: enriched.filter((item) => matches(name, item.row.kind, item.origin, item.borrowed))
        .length,
    }),
    {} as Record<LibraryFilter, number>,
  );

  return {
    rows: enriched
      .filter((item) => matches(filter, item.row.kind, item.origin, item.borrowed))
      .map((item) => item.row),
    counts,
  };
};

export const isLibraryFilter = (value: unknown): value is LibraryFilter =>
  value === 'all' || value === 'mine' || value === 'reference' || value === 'instruction';
