import type { MemexClient } from './client.ts';
import { bodyHash } from './evidence.ts';

export type NoteShapeKind = 'position' | 'index';

export type NoteShape = {
  noteId: number;
  kind: NoteShapeKind;
  claims: string[];
  sourceHash: string;
  modelId: string | null;
  stale: boolean;
};

export type NoteShapeInput = {
  noteId: number;
  kind: NoteShapeKind;
  claims: string[];
  modelId?: string;
};

const CLAIM_CEILING = 10;

export const overClaimCeiling = (claims: string[]) => claims.length > CLAIM_CEILING;

export const setNoteShape = (
  client: MemexClient,
  input: NoteShapeInput,
  at = Date.now(),
): NoteShape | null => {
  const row = client.sqlite.prepare('SELECT content FROM notes WHERE id = ?').get(input.noteId) as
    | { content: string }
    | undefined;
  if (!row) return null;

  const hash = bodyHash(row.content);
  const kind = overClaimCeiling(input.claims) ? 'index' : input.kind;
  const claims = kind === 'index' ? [] : input.claims;

  client.sqlite.transaction(() => {
    client.sqlite
      .prepare(
        `INSERT INTO note_shape (note_id, kind, source_hash, model_id, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(note_id) DO UPDATE SET
           kind = excluded.kind,
           source_hash = excluded.source_hash,
           model_id = excluded.model_id,
           created_at = excluded.created_at`,
      )
      .run(input.noteId, kind, hash, input.modelId ?? null, at);
    client.sqlite.prepare('DELETE FROM note_claims WHERE note_id = ?').run(input.noteId);
    const insert = client.sqlite.prepare(
      'INSERT INTO note_claims (note_id, idx, text) VALUES (?, ?, ?)',
    );
    claims.forEach((text, idx) => {
      insert.run(input.noteId, idx, text);
    });
  })();

  return {
    noteId: input.noteId,
    kind,
    claims,
    sourceHash: hash,
    modelId: input.modelId ?? null,
    stale: false,
  };
};

export const getNoteShape = (client: MemexClient, noteId: number): NoteShape | null => {
  const shape = client.sqlite
    .prepare(
      `SELECT s.kind, s.source_hash AS sourceHash, s.model_id AS modelId, n.content
       FROM note_shape s JOIN notes n ON n.id = s.note_id
       WHERE s.note_id = ?`,
    )
    .get(noteId) as
    | { kind: NoteShapeKind; sourceHash: string; modelId: string | null; content: string }
    | undefined;
  if (!shape) return null;

  const claims = (
    client.sqlite
      .prepare('SELECT text FROM note_claims WHERE note_id = ? ORDER BY idx')
      .all(noteId) as { text: string }[]
  ).map((r) => r.text);

  return {
    noteId,
    kind: shape.kind,
    claims,
    sourceHash: shape.sourceHash,
    modelId: shape.modelId,
    stale: bodyHash(shape.content) !== shape.sourceHash,
  };
};

type FreshRow = { noteId: number; kind: NoteShapeKind };

// A stale classification is not a verdict, so a note whose body moved since it
// was read is treated as unread rather than kept on an old answer.
const freshShapes = (client: MemexClient): FreshRow[] =>
  (
    client.sqlite
      .prepare(
        `SELECT s.note_id AS noteId, s.kind, s.source_hash AS sourceHash, n.content
         FROM note_shape s JOIN notes n ON n.id = s.note_id`,
      )
      .all() as { noteId: number; kind: NoteShapeKind; sourceHash: string; content: string }[]
  )
    .filter((r) => bodyHash(r.content) === r.sourceHash)
    .map(({ noteId, kind }) => ({ noteId, kind }));

export const indexTypeNoteIds = (client: MemexClient): number[] =>
  freshShapes(client)
    .filter((r) => r.kind === 'index')
    .map((r) => r.noteId);

export const shapedNoteIds = (client: MemexClient): number[] =>
  freshShapes(client).map((r) => r.noteId);
