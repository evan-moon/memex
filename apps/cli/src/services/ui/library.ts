import {
  type DocumentKind,
  type DocumentOrigin,
  getDocumentMeta,
  type MemexClient,
} from '@memex/db';
import { inVault } from '@memex/utils';

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

// `notes.author` defaults to person for the whole corpus, so it is evidence of
// nothing and is not read here. `source` and `layer` are different: they record
// how a note arrived, and a value that was written down rather than defaulted
// can be believed.
//
// A folder somebody connected because they wrote what is in it is borrowed as
// far as indexing goes and theirs as far as authorship goes. Nothing in the
// files says which, so the person says it once per folder rather than 216 times.
const originOf = (
  declared: DocumentOrigin,
  source: string,
  layer: string,
  mine: boolean,
): DocumentOrigin => {
  if (declared !== 'unknown') return declared;
  if (source === 'claude-code') return 'agent';
  if (mine) return 'person';
  if (source === 'manual') return 'person';
  if (layer === 'external') return 'external';
  return 'unknown';
};

const kindOf = (declared: DocumentKind, layer: string, origin: DocumentOrigin): DocumentKind => {
  if (declared !== 'unknown') return declared;
  if (layer === 'rule') return 'instruction';
  if (origin === 'external') return 'reference';
  return 'unknown';
};

const matches = (filter: LibraryFilter, kind: DocumentKind, origin: DocumentOrigin): boolean => {
  if (filter === 'all') return true;
  if (filter === 'mine') return origin === 'person';
  if (filter === 'reference') return kind === 'reference' || origin === 'external';
  return kind === 'instruction';
};

export const buildLibrary = (
  client: MemexClient,
  filter: LibraryFilter = 'all',
  limit = 500,
  authored: string[] = [],
): LibraryPage => {
  const rows = client.sqlite
    .prepare(
      `SELECT id, title, COALESCE(category, '') AS folder, updated_at, layer, source, file_path
       FROM notes ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as Row[];

  const enriched = rows.map((row) => {
    const meta = getDocumentMeta(client, row.id);
    const mine = authored.some((root) => inVault(row.file_path, root));
    const origin = originOf(meta.origin, row.source, row.layer, mine);
    return {
      row: {
        id: row.id,
        title: row.title,
        folder: row.folder,
        kind: kindOf(meta.kind, row.layer, origin),
        updatedAt: row.updated_at,
        writingStatus: meta.writingStatus,
      },
      origin,
    };
  });

  const counts = (['all', 'mine', 'reference', 'instruction'] as const).reduce(
    (acc, name) => ({
      ...acc,
      [name]: enriched.filter((item) => matches(name, item.row.kind, item.origin)).length,
    }),
    {} as Record<LibraryFilter, number>,
  );

  return {
    rows: enriched.filter((item) => matches(filter, item.row.kind, item.origin)).map((i) => i.row),
    counts,
  };
};

export const isLibraryFilter = (value: unknown): value is LibraryFilter =>
  value === 'all' || value === 'mine' || value === 'reference' || value === 'instruction';
