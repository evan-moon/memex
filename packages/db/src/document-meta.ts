import type { MemexClient } from './client.ts';

// What a document is, as opposed to what it says. Every field has a value that
// means "nobody has told us", because most of the vault predates this table and
// guessing would be worse than admitting it.
export type DocumentMode = 'document' | 'legacy-memory';
export type DocumentKind = 'note' | 'reference' | 'draft' | 'instruction' | 'unknown';
export type DocumentOrigin = 'person' | 'external' | 'agent' | 'unknown';
export type WritingStatus = 'working' | 'finished' | null;

export type DocumentMeta = {
  documentId: number;
  mode: DocumentMode;
  kind: DocumentKind;
  origin: DocumentOrigin;
  writingStatus: WritingStatus;
  currentRevision: string | null;
};

type Row = {
  document_id: number;
  mode: DocumentMode;
  kind: DocumentKind;
  origin: DocumentOrigin;
  writing_status: WritingStatus;
  current_revision: string | null;
};

// `origin: unknown` rather than person, and `mode: legacy-memory` rather than
// document. `notes.author` defaults to person for the entire corpus, so reading
// it as ownership would hand the person authorship of everything an agent wrote;
// and a note written under the memory contract keeps answering to it until
// somebody says otherwise.
const unknownMeta = (documentId: number): DocumentMeta => ({
  documentId,
  mode: 'legacy-memory',
  kind: 'unknown',
  origin: 'unknown',
  writingStatus: null,
  currentRevision: null,
});

const asMeta = (row: Row): DocumentMeta => ({
  documentId: row.document_id,
  mode: row.mode,
  kind: row.kind,
  origin: row.origin,
  writingStatus: row.writing_status,
  currentRevision: row.current_revision,
});

export const getDocumentMeta = (client: MemexClient, documentId: number): DocumentMeta => {
  const row = client.sqlite
    .prepare('SELECT * FROM document_meta WHERE document_id = ?')
    .get(documentId) as Row | undefined;
  return row === undefined ? unknownMeta(documentId) : asMeta(row);
};

export type DocumentMetaPatch = Partial<Omit<DocumentMeta, 'documentId'>>;

// Merged onto whatever is there. A write that says nothing about origin must not
// blank it: an AI edit a person accepted does not make the person the author of
// the original, and that distinction only survives if silence means "unchanged".
export const setDocumentMeta = (
  client: MemexClient,
  documentId: number,
  patch: DocumentMetaPatch,
): DocumentMeta => {
  const merged = { ...getDocumentMeta(client, documentId), ...patch };
  client.sqlite
    .prepare(
      `INSERT INTO document_meta
         (document_id, mode, kind, origin, writing_status, current_revision, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(document_id) DO UPDATE SET
         mode = excluded.mode,
         kind = excluded.kind,
         origin = excluded.origin,
         writing_status = excluded.writing_status,
         current_revision = excluded.current_revision,
         updated_at = excluded.updated_at`,
    )
    .run(
      documentId,
      merged.mode,
      merged.kind,
      merged.origin,
      merged.writingStatus,
      merged.currentRevision,
      Date.now(),
    );
  return merged;
};
