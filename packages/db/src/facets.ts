import { type CardField, type CardQuality, extractCard, type NoteCard } from './card.ts';
import {
  type ClassifyMethod,
  type Confidence,
  classifyNote,
  isNoteType,
  type NoteArea,
  type NoteType,
  type NoteTypeLabel,
} from './classify.ts';
import type { MemexClient } from './client.ts';
import type { NoteLayer } from './schema.ts';

export type NoteFacets = { label: NoteTypeLabel; card: NoteCard };

const FACET_BATCH = 500;

type FacetSource = {
  id: number;
  title: string;
  content: string;
  file_path: string;
  category: string | null;
  tags: string;
  layer: NoteLayer;
  type: string | null;
};

const SOURCE_COLUMNS = 'title, content, file_path, category, tags, layer, type';

const facetsOf = (row: FacetSource): NoteFacets => {
  const label = classifyNote({
    filePath: row.file_path,
    title: row.title,
    content: row.content,
    layer: row.layer,
    tags: JSON.parse(row.tags) as string[],
    category: row.category,
    declaredType: isNoteType(row.type) ? row.type : null,
  });
  return { label, card: extractCard({ title: row.title, content: row.content, type: label.type }) };
};

const writeFacets = (client: MemexClient, noteId: number, facets: NoteFacets, at: number) => {
  client.sqlite
    .prepare(
      `INSERT INTO note_type_labels (note_id, type, area, method, confidence, at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(note_id) DO UPDATE SET
         type = excluded.type, area = excluded.area, method = excluded.method,
         confidence = excluded.confidence, at = excluded.at`,
    )
    .run(
      noteId,
      facets.label.type,
      facets.label.area,
      facets.label.method,
      facets.label.confidence,
      at,
    );
  client.sqlite
    .prepare(
      `INSERT INTO note_cards (note_id, line, field, quality, at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(note_id) DO UPDATE SET
         line = excluded.line, field = excluded.field, quality = excluded.quality, at = excluded.at`,
    )
    .run(noteId, facets.card.line, facets.card.field, facets.card.quality, at);
};

export const syncNoteFacets = (client: MemexClient, noteId: number): NoteFacets | null => {
  const row = client.sqlite
    .prepare(`SELECT id, ${SOURCE_COLUMNS} FROM notes WHERE id = ?`)
    .get(noteId) as FacetSource | undefined;
  if (row === undefined) return null;

  const facets = facetsOf(row);
  writeFacets(client, noteId, facets, Date.now());
  return facets;
};

export const dropNoteFacets = (client: MemexClient, noteId: number) => {
  client.sqlite.prepare('DELETE FROM note_type_labels WHERE note_id = ?').run(noteId);
  client.sqlite.prepare('DELETE FROM note_cards WHERE note_id = ?').run(noteId);
};

export const resyncNoteFacets = (client: MemexClient): { notes: number } => {
  const page = client.sqlite.prepare(
    `SELECT id, ${SOURCE_COLUMNS} FROM notes WHERE id > ? ORDER BY id LIMIT ${FACET_BATCH}`,
  );

  const step = (afterId: number, done: number): number => {
    const rows = page.all(afterId) as FacetSource[];
    if (rows.length === 0) return done;
    const at = Date.now();
    client.sqlite.transaction(() => {
      for (const row of rows) writeFacets(client, row.id, facetsOf(row), at);
    })();
    return step(rows[rows.length - 1].id, done + rows.length);
  };

  client.sqlite.exec(
    'DELETE FROM note_type_labels WHERE note_id NOT IN (SELECT id FROM notes);' +
      'DELETE FROM note_cards WHERE note_id NOT IN (SELECT id FROM notes)',
  );

  return { notes: step(0, 0) };
};

export const getNoteTypeLabel = (client: MemexClient, noteId: number): NoteTypeLabel | null => {
  const row = client.sqlite
    .prepare('SELECT type, area, method, confidence FROM note_type_labels WHERE note_id = ?')
    .get(noteId) as
    | { type: NoteType; area: NoteArea; method: ClassifyMethod; confidence: Confidence }
    | undefined;
  return row ?? null;
};

export const getNoteCard = (client: MemexClient, noteId: number): NoteCard | null => {
  const row = client.sqlite
    .prepare('SELECT line, field, quality FROM note_cards WHERE note_id = ?')
    .get(noteId) as { line: string | null; field: CardField; quality: CardQuality } | undefined;
  return row ?? null;
};
