import type { DocumentBuffer } from './api.ts';
import { bodyUnder, titleOf } from './heading.ts';
import { decodeNewDocument } from './new-document.ts';

export type Recovery =
  | { kind: 'nothing' }
  | { kind: 'already-saved' }
  | { kind: 'unsaved'; draft: string; saved: string }
  | { kind: 'conflict'; draft: string; saved: string };

export type DraftAt = {
  content: string;
  baseRevision: string | null;
};

export type SavedAt = {
  raw: string;
  revision: string | null;
};

export const recoveryFor = (draft: DraftAt | undefined, saved: SavedAt): Recovery => {
  if (draft === undefined) return { kind: 'nothing' };
  if (draft.content === saved.raw) return { kind: 'already-saved' };
  if (draft.baseRevision !== null && draft.baseRevision !== saved.revision) {
    return { kind: 'conflict', draft: draft.content, saved: saved.raw };
  }
  return { kind: 'unsaved', draft: draft.content, saved: saved.raw };
};

export type RecoverableDraft = {
  draftKey: string;
  documentId: number | null;
  title: string;
  snippet: string;
  path: string;
  at: number;
};

const draftPath = (draftKey: string, folder?: string | null): string => {
  const params = new URLSearchParams({ draft: draftKey });
  if (folder) params.set('folder', folder);
  return `/new?${params.toString()}`;
};

export const recoverableDraft = (buffer: DocumentBuffer): RecoverableDraft => {
  const recovered = decodeNewDocument(buffer.content);
  return {
    draftKey: buffer.draftKey,
    documentId: buffer.documentId,
    title: titleOf(recovered.markdown),
    snippet: bodyUnder(recovered.markdown).trim(),
    path:
      buffer.documentId === null
        ? draftPath(buffer.draftKey, recovered.folder)
        : `/note/${buffer.documentId}`,
    at: buffer.at,
  };
};
