import { createHash, randomUUID } from 'node:crypto';
import type { MemexClient } from './client.ts';
import { getDocumentMeta, setDocumentMeta } from './document-meta.ts';

// Who put this version there. `external` is an editor that is not memex, whose
// writing is discovered rather than performed; `system` is a restore or a
// recovery, which nobody typed.
export type RevisionActor = 'user' | 'agent' | 'external' | 'system';

export type Revision = {
  revisionId: string;
  documentId: number;
  parentRevision: string | null;
  rawContent: string;
  fileHash: string;
  actor: RevisionActor;
  at: number;
  mutationId: string | null;
  reason: string | null;
};

type Row = {
  revision_id: string;
  document_id: number;
  parent_revision: string | null;
  raw_content: string;
  file_hash: string;
  actor: RevisionActor;
  at: number;
  mutation_id: string | null;
  reason: string | null;
};

const asRevision = (row: Row): Revision => ({
  revisionId: row.revision_id,
  documentId: row.document_id,
  parentRevision: row.parent_revision,
  rawContent: row.raw_content,
  fileHash: row.file_hash,
  actor: row.actor,
  at: row.at,
  mutationId: row.mutation_id,
  reason: row.reason,
});

// The hash is of the whole file as it sits on disk. It is what tells an edit
// memex performed from one it merely found.
export const hashOf = (rawContent: string): string =>
  createHash('sha256').update(rawContent, 'utf8').digest('hex');

export const getRevision = (client: MemexClient, revisionId: string): Revision | undefined => {
  const row = client.sqlite
    .prepare('SELECT * FROM document_revisions WHERE revision_id = ?')
    .get(revisionId) as Row | undefined;
  return row === undefined ? undefined : asRevision(row);
};

export const currentRevision = (client: MemexClient, documentId: number): Revision | undefined => {
  const at = getDocumentMeta(client, documentId).currentRevision;
  return at === null ? undefined : getRevision(client, at);
};

export const listRevisions = (client: MemexClient, documentId: number, limit = 50): Revision[] => {
  const rows = client.sqlite
    .prepare(
      'SELECT * FROM document_revisions WHERE document_id = ? ORDER BY at DESC, rowid DESC LIMIT ?',
    )
    .all(documentId, limit) as Row[];
  return rows.map(asRevision);
};

const byMutation = (client: MemexClient, mutationId: string): Revision | undefined => {
  const row = client.sqlite
    .prepare('SELECT * FROM document_revisions WHERE mutation_id = ?')
    .get(mutationId) as Row | undefined;
  return row === undefined ? undefined : asRevision(row);
};

export type NewRevision = {
  documentId: number;
  rawContent: string;
  actor: RevisionActor;
  mutationId?: string;
  reason?: string;
  // Only for a restore, where the version being written descends from the
  // current one and not from the version whose text it carries.
  parentRevision?: string | null;
};

// A retry is not a second edit. A client that lost the response and sent the
// same mutation again gets the revision the first call made, so the history does
// not grow a duplicate every time a connection drops.
export const recordRevision = (client: MemexClient, input: NewRevision): Revision => {
  if (input.mutationId !== undefined) {
    const already = byMutation(client, input.mutationId);
    if (already !== undefined) return already;
  }

  const meta = getDocumentMeta(client, input.documentId);
  const revision: Revision = {
    revisionId: randomUUID(),
    documentId: input.documentId,
    parentRevision:
      input.parentRevision === undefined ? meta.currentRevision : input.parentRevision,
    rawContent: input.rawContent,
    fileHash: hashOf(input.rawContent),
    actor: input.actor,
    at: Date.now(),
    mutationId: input.mutationId ?? null,
    reason: input.reason ?? null,
  };

  client.sqlite.transaction(() => {
    client.sqlite
      .prepare(
        `INSERT INTO document_revisions
           (revision_id, document_id, parent_revision, raw_content, file_hash, actor, at, mutation_id, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        revision.revisionId,
        revision.documentId,
        revision.parentRevision,
        revision.rawContent,
        revision.fileHash,
        revision.actor,
        revision.at,
        revision.mutationId,
        revision.reason,
      );
    setDocumentMeta(client, input.documentId, { currentRevision: revision.revisionId });
  })();

  return revision;
};
