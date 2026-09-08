import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  commitMutation,
  currentRevision,
  DocumentBusy,
  type DocumentMeta,
  deleteNote,
  failMutation,
  findMutation,
  getDocumentMeta,
  getNote,
  hashOf,
  insertNote,
  type MemexClient,
  type Note,
  prepareMutation,
  type Revision,
  recordRevision,
  setDocumentMeta,
  syncLinks,
  withDocumentLock,
} from '@memex/db';
import { inVault, sanitizeFilename, stripFrontmatter } from '@memex/utils';
import {
  type Actor,
  type Capabilities,
  canWriteDocument,
  capabilitiesFor,
} from './document-policy.ts';

export type DocumentContext = {
  actor: Actor;
  vaultPath: string;
  // Which process is asking. It goes on the lock so a stuck one can be named.
  holder?: string;
};

export type DocumentRead = {
  id: number;
  title: string;
  raw: string;
  body: string;
  filePath: string;
  meta: DocumentMeta;
  revision: string | null;
  capabilities: Capabilities;
};

export type DocumentFailure =
  | { error: 'not-found'; message: string }
  | {
      error: 'version-conflict';
      message: string;
      currentRevision: string | null;
      currentRaw: string;
    }
  | { error: 'write-not-allowed'; message: string; code: string }
  | { error: 'write-failed'; message: string }
  | { error: 'busy'; message: string };

export const isDocumentFailure = (value: unknown): value is DocumentFailure =>
  typeof value === 'object' && value !== null && 'error' in value;

const requestFor = (client: MemexClient, note: Note, context: DocumentContext) => ({
  actor: context.actor,
  meta: getDocumentMeta(client, note.id),
  layer: note.layer,
  inVault: inVault(note.filePath, context.vaultPath),
});

// The file is the document. `notes.content` is memex's copy of it, and where the
// two differ the disk wins — somebody edited it in another editor and that is
// their text, not a stale cache to be overwritten.
const rawOnDisk = (note: Note): string =>
  existsSync(note.filePath) ? readFileSync(note.filePath, 'utf8') : note.content;

export const readDocument = (
  client: MemexClient,
  id: number,
  context: DocumentContext,
): DocumentRead | DocumentFailure => {
  const note = getNote(client, id);
  if (!note) return { error: 'not-found', message: `#${id} is not a document.` };

  const raw = rawOnDisk(note);
  return {
    id: note.id,
    title: note.title,
    raw,
    body: stripFrontmatter(raw),
    filePath: note.filePath,
    meta: getDocumentMeta(client, id),
    revision: currentRevision(client, id)?.revisionId ?? null,
    capabilities: capabilitiesFor(requestFor(client, note, context)),
  };
};

// Written into the same directory and moved into place, so a reader never sees
// half a document. A temp file elsewhere would cross a filesystem boundary and
// stop being a rename.
const swapInto = (filePath: string, raw: string) => {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = join(dirname(filePath), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, raw, 'utf8');
    renameSync(temporary, filePath);
  } catch (cause) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw cause;
  }
};

// The first edit of a document that has never been saved through memex. Its
// current text becomes the baseline, so the edit has something to be a change
// from — history starts now and does not pretend to cover the years before it.
const baselineIfMissing = (client: MemexClient, note: Note, raw: string): Revision | undefined => {
  if (currentRevision(client, note.id) !== undefined) return undefined;
  return recordRevision(client, {
    documentId: note.id,
    rawContent: raw,
    actor: 'external',
    reason: 'baseline',
  });
};

export type CreateDocument = {
  title: string;
  raw: string;
  folder?: string;
  kind?: DocumentMeta['kind'];
  mutationId?: string;
};

export type DocumentWritten = { id: number; revision: string; raw: string };

const freePath = (folder: string, title: string): string => {
  const stem = sanitizeFilename(title) || 'untitled';
  const first = join(folder, `${stem}.md`);
  if (!existsSync(first)) return first;
  for (let n = 2; n < 200; n += 1) {
    const candidate = join(folder, `${stem} ${n}.md`);
    if (!existsSync(candidate)) return candidate;
  }
  return join(folder, `${stem} ${randomUUID().slice(0, 8)}.md`);
};

// No embedder, no model, no layer, no required sections. A person opening the
// app for the first time can write and keep a document before anything has
// finished downloading; meaning-search catches up afterwards.
export const createDocument = (
  client: MemexClient,
  input: CreateDocument,
  context: DocumentContext,
): DocumentWritten | DocumentFailure => {
  if (context.actor !== 'user') {
    const verdict = canWriteDocument({
      actor: context.actor,
      meta: { ...getDocumentMeta(client, 0), origin: 'agent' },
      layer: 'state',
      inVault: true,
    });
    if (!verdict.allowed) {
      return { error: 'write-not-allowed', message: verdict.message, code: verdict.code };
    }
  }

  const folder = input.folder ? join(context.vaultPath, input.folder) : context.vaultPath;
  const filePath = freePath(folder, input.title);

  try {
    swapInto(filePath, input.raw);
  } catch (cause) {
    return {
      error: 'write-failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }

  const note = insertNote(client, {
    title: input.title,
    content: input.raw,
    filePath,
    source: context.actor === 'user' ? 'manual' : 'claude-code',
    // A document is not a memory record. `state` is the technical default the
    // contract names, and it does not by itself make anything extract claims.
    layer: 'state',
    category: input.folder ?? null,
  });
  syncLinks(client, note.id, input.raw);

  const revision = recordRevision(client, {
    documentId: note.id,
    rawContent: input.raw,
    actor: context.actor === 'user' ? 'user' : 'agent',
    mutationId: input.mutationId,
    reason: 'created',
  });
  setDocumentMeta(client, note.id, {
    mode: 'document',
    kind: input.kind ?? (context.actor === 'user' ? 'note' : 'draft'),
    origin: context.actor === 'user' ? 'person' : 'agent',
    writingStatus: 'working',
  });

  return { id: note.id, revision: revision.revisionId, raw: input.raw };
};

export type UpdateDocument = {
  raw: string;
  expectedRevision: string | null;
  mutationId: string;
  reason?: string;
};

// The protocol the contract spells out, in order: decide, serialise, compare the
// disk, check the base, journal the intent, swap the file, confirm. Anything
// that fails after the journal is written is recoverable, because the journal
// says what was meant to happen.
export const updateDocument = (
  client: MemexClient,
  id: number,
  input: UpdateDocument,
  context: DocumentContext,
): DocumentWritten | DocumentFailure => {
  const note = getNote(client, id);
  if (!note) return { error: 'not-found', message: `#${id} is not a document.` };

  const verdict = canWriteDocument(requestFor(client, note, context));
  if (!verdict.allowed) {
    return { error: 'write-not-allowed', message: verdict.message, code: verdict.code };
  }

  // A retry of a write that already landed returns what it produced. Sending it
  // twice is a lost response, not a second edit.
  const already = findMutation(client, input.mutationId);
  if (already?.stage === 'committed' && already.resultRevision !== null) {
    return {
      id,
      revision: already.resultRevision,
      raw: rawOnDisk(getNote(client, id) ?? note),
    };
  }

  // Busy is an outcome, not an exception. Every other way this can go returns a
  // value the caller already has to read, and one path that throws instead is a
  // path somebody forgets to handle.
  try {
    return writeUnderLock(client, id, input, context);
  } catch (cause) {
    if (cause instanceof DocumentBusy) {
      return {
        error: 'busy',
        message: 'Something else is writing this document right now. Try again in a moment.',
      };
    }
    throw cause;
  }
};

const writeUnderLock = (
  client: MemexClient,
  id: number,
  input: UpdateDocument,
  context: DocumentContext,
): DocumentWritten | DocumentFailure =>
  withDocumentLock(client, id, context.holder ?? 'memex', () => {
    const fresh = getNote(client, id);
    if (!fresh) return { error: 'not-found', message: `#${id} is not a document.` };

    const onDisk = rawOnDisk(fresh);
    baselineIfMissing(client, fresh, onDisk);

    // What the file actually says outranks what the database remembers. An
    // outside editor does not take memex's lock, so its writing is discovered
    // here and kept as a version of its own rather than silently replaced.
    const known = currentRevision(client, id);
    if (known !== undefined && known.fileHash !== hashOf(onDisk)) {
      const found = recordRevision(client, {
        documentId: id,
        rawContent: onDisk,
        actor: 'external',
        reason: 'found on disk',
      });
      return {
        error: 'version-conflict',
        message: 'This document was changed somewhere else. Compare before writing over it.',
        currentRevision: found.revisionId,
        currentRaw: onDisk,
      };
    }

    const base = currentRevision(client, id);
    if (input.expectedRevision !== null && base?.revisionId !== input.expectedRevision) {
      return {
        error: 'version-conflict',
        message: 'This document moved on since that version. Compare before writing over it.',
        currentRevision: base?.revisionId ?? null,
        currentRaw: onDisk,
      };
    }

    prepareMutation(client, {
      mutationId: input.mutationId,
      documentId: id,
      expectedRevision: input.expectedRevision,
      intendedHash: hashOf(input.raw),
    });

    try {
      swapInto(fresh.filePath, input.raw);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      failMutation(client, input.mutationId, message);
      return { error: 'write-failed', message };
    }

    const revision = recordRevision(client, {
      documentId: id,
      rawContent: input.raw,
      actor: context.actor === 'user' ? 'user' : 'agent',
      mutationId: input.mutationId,
      reason: input.reason,
    });
    client.sqlite
      .prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?')
      .run(input.raw, Date.now(), id);
    syncLinks(client, id, input.raw);
    commitMutation(client, input.mutationId, revision.revisionId);

    return { id, revision: revision.revisionId, raw: input.raw };
  });

// Restoring is writing, not rewinding. The old text comes back as a new version
// on top of the current one, so the thing being undone stays in the history.
export const restoreDocument = (
  client: MemexClient,
  id: number,
  revisionToRestore: string,
  expectedRevision: string | null,
  context: DocumentContext,
): DocumentWritten | DocumentFailure => {
  const note = getNote(client, id);
  if (!note) return { error: 'not-found', message: `#${id} is not a document.` };

  const wanted = client.sqlite
    .prepare('SELECT raw_content FROM document_revisions WHERE revision_id = ? AND document_id = ?')
    .get(revisionToRestore, id) as { raw_content: string } | undefined;
  if (wanted === undefined) {
    return { error: 'not-found', message: 'That version is not one of this document’s.' };
  }

  return updateDocument(
    client,
    id,
    {
      raw: wanted.raw_content,
      expectedRevision,
      mutationId: randomUUID(),
      reason: `restored ${revisionToRestore}`,
    },
    context,
  );
};

export const forgetDocument = (client: MemexClient, id: number) => deleteNote(client, id);
