import type { MemexClient } from './client.ts';
import { currentRevision } from './document-revisions.ts';

// A reference is a pointer with a version on it. The passage stays in the
// document it came from — copying it into the body would make a second original
// that nothing keeps in step, and the whole value here is being able to say
// "what you quoted has changed" a month later.
export type SourceState = 'current' | 'changed' | 'missing';

export type DocumentReference = {
  id: number;
  ownerDocumentId: number;
  sourceDocumentId: number;
  sourceRevision: string | null;
  quote: string;
  heading: string | null;
  at: number;
  title: string | null;
  state: SourceState;
};

type Row = {
  id: number;
  owner_document_id: number;
  source_document_id: number;
  source_revision: string | null;
  quote: string;
  heading: string | null;
  at: number;
  title: string | null;
};

const stateOf = (client: MemexClient, row: Row): SourceState => {
  if (row.title === null) return 'missing';
  if (row.source_revision === null) return 'current';
  const now = currentRevision(client, row.source_document_id);
  // A source memex has never saved has no version to differ from, so nothing
  // can be said about it having moved.
  if (now === undefined) return 'current';
  return now.revisionId === row.source_revision ? 'current' : 'changed';
};

const asReference = (client: MemexClient, row: Row): DocumentReference => ({
  id: row.id,
  ownerDocumentId: row.owner_document_id,
  sourceDocumentId: row.source_document_id,
  sourceRevision: row.source_revision,
  quote: row.quote,
  heading: row.heading,
  at: row.at,
  title: row.title,
  state: stateOf(client, row),
});

const rowsFor = (client: MemexClient, ownerDocumentId: number): Row[] =>
  client.sqlite
    .prepare(
      `SELECT r.*, n.title AS title
       FROM document_references r LEFT JOIN notes n ON n.id = r.source_document_id
       WHERE r.owner_document_id = ? ORDER BY r.at DESC`,
    )
    .all(ownerDocumentId) as Row[];

export const referencesFor = (client: MemexClient, ownerDocumentId: number): DocumentReference[] =>
  rowsFor(client, ownerDocumentId).map((row) => asReference(client, row));

export type NewReference = {
  ownerDocumentId: number;
  sourceDocumentId: number;
  quote?: string;
  heading?: string | null;
};

// Adding the same source twice is one reference, not two. Somebody who finds
// the passage again has found the same thing, and a list that grew a row every
// time would be a list nobody reads.
export const addReference = (client: MemexClient, input: NewReference): DocumentReference => {
  const revision = currentRevision(client, input.sourceDocumentId)?.revisionId ?? null;
  client.sqlite
    .prepare(
      `INSERT INTO document_references
         (owner_document_id, source_document_id, source_revision, quote, heading, at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_document_id, source_document_id) DO UPDATE SET
         source_revision = excluded.source_revision,
         quote = excluded.quote,
         heading = excluded.heading,
         at = excluded.at`,
    )
    .run(
      input.ownerDocumentId,
      input.sourceDocumentId,
      revision,
      input.quote ?? '',
      input.heading ?? null,
      Date.now(),
    );

  const row = rowsFor(client, input.ownerDocumentId).find(
    (candidate) => candidate.source_document_id === input.sourceDocumentId,
  );
  if (row === undefined) throw new Error('the reference did not survive being written');
  return asReference(client, row);
};

export const dropReference = (
  client: MemexClient,
  ownerDocumentId: number,
  sourceDocumentId: number,
) => {
  client.sqlite
    .prepare(
      'DELETE FROM document_references WHERE owner_document_id = ? AND source_document_id = ?',
    )
    .run(ownerDocumentId, sourceDocumentId);
};
