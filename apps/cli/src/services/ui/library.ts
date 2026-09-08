import { type DocumentKind, getDocumentMeta, type MemexClient } from '@memex/db';

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
};

// `mine` is not "author says person". That column defaults to person for the
// whole corpus, so it is evidence of nothing. Only a document somebody actually
// wrote here, or one they said was theirs, counts.
const matches = (filter: LibraryFilter, kind: DocumentKind, origin: string): boolean => {
  if (filter === 'all') return true;
  if (filter === 'mine') return origin === 'person';
  if (filter === 'reference') return kind === 'reference' || origin === 'external';
  return kind === 'instruction';
};

export const buildLibrary = (
  client: MemexClient,
  filter: LibraryFilter = 'all',
  limit = 500,
): LibraryPage => {
  const rows = client.sqlite
    .prepare(
      `SELECT id, title, COALESCE(category, '') AS folder, updated_at, layer
       FROM notes ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as Row[];

  const enriched = rows.map((row) => {
    const meta = getDocumentMeta(client, row.id);
    return {
      row: {
        id: row.id,
        title: row.title,
        folder: row.folder,
        kind: row.layer === 'rule' ? ('instruction' as const) : meta.kind,
        updatedAt: row.updated_at,
        writingStatus: meta.writingStatus,
      },
      origin: meta.origin,
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
