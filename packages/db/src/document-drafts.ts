import type { MemexClient } from './client.ts';

// The editor's buffer, kept where a crash cannot reach it. A debounced file save
// is what makes an edit permanent; this is what makes it survivable in between.
//
// Keyed by a string rather than a note id, because a document being typed for
// the first time has no id yet — the key the editor made is what stops a slow
// create response from producing a second file.
export type DocumentDraft = {
  draftKey: string;
  vaultId: string;
  documentId: number | null;
  baseRevision: string | null;
  content: string;
  sequence: number;
  at: number;
};

type Row = {
  draft_key: string;
  vault_id: string;
  document_id: number | null;
  base_revision: string | null;
  content: string;
  sequence: number;
  at: number;
};

const asDraft = (row: Row): DocumentDraft => ({
  draftKey: row.draft_key,
  vaultId: row.vault_id,
  documentId: row.document_id,
  baseRevision: row.base_revision,
  content: row.content,
  sequence: row.sequence,
  at: row.at,
});

export const getDocumentDraft = (
  client: MemexClient,
  draftKey: string,
): DocumentDraft | undefined => {
  const row = client.sqlite
    .prepare('SELECT * FROM document_drafts WHERE draft_key = ?')
    .get(draftKey) as Row | undefined;
  return row === undefined ? undefined : asDraft(row);
};

export type NewDocumentDraft = {
  draftKey: string;
  vaultId: string;
  documentId?: number | null;
  baseRevision?: string | null;
  content: string;
  sequence: number;
};

// An older sequence arriving late must not replace a newer one. The drafts are
// written from the same tab that is still being typed in, and the network under
// them does not promise order.
export const putDocumentDraft = (client: MemexClient, input: NewDocumentDraft): DocumentDraft => {
  const existing = getDocumentDraft(client, input.draftKey);
  if (existing !== undefined && existing.sequence > input.sequence) return existing;

  const draft: DocumentDraft = {
    draftKey: input.draftKey,
    vaultId: input.vaultId,
    documentId: input.documentId ?? null,
    baseRevision: input.baseRevision ?? null,
    content: input.content,
    sequence: input.sequence,
    at: Date.now(),
  };
  client.sqlite
    .prepare(
      `INSERT INTO document_drafts
         (draft_key, vault_id, document_id, base_revision, content, sequence, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(draft_key) DO UPDATE SET
         vault_id = excluded.vault_id,
         document_id = excluded.document_id,
         base_revision = excluded.base_revision,
         content = excluded.content,
         sequence = excluded.sequence,
         at = excluded.at`,
    )
    .run(
      draft.draftKey,
      draft.vaultId,
      draft.documentId,
      draft.baseRevision,
      draft.content,
      draft.sequence,
      draft.at,
    );
  return draft;
};

export const dropDocumentDraft = (client: MemexClient, draftKey: string) => {
  client.sqlite.prepare('DELETE FROM document_drafts WHERE draft_key = ?').run(draftKey);
};

// What the app asks on the way back in. One vault's unsaved work, newest first,
// so a person who lost power is shown the paragraph rather than told about it.
export const unsavedDrafts = (client: MemexClient, vaultId: string): DocumentDraft[] =>
  (
    client.sqlite
      .prepare('SELECT * FROM document_drafts WHERE vault_id = ? ORDER BY at DESC')
      .all(vaultId) as Row[]
  ).map(asDraft);
