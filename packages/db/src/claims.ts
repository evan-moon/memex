import { type ClaimKind, classifyClaim } from './claim-kind.ts';
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
    const held = client.sqlite
      .prepare('SELECT idx, text FROM note_claims WHERE note_id = ?')
      .all(input.noteId) as { idx: number; text: string }[];
    const kept = new Set(held.filter((row) => claims[row.idx] === row.text).map((row) => row.idx));
    const drop = client.sqlite.prepare('DELETE FROM note_claims WHERE note_id = ? AND idx = ?');
    for (const row of held) if (!kept.has(row.idx)) drop.run(input.noteId, row.idx);

    const insert = client.sqlite.prepare(
      `INSERT INTO note_claims (note_id, idx, text, source_hash, valid_from, kind)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const validFrom = (
      client.sqlite
        .prepare('SELECT COALESCE(authored_at, created_at) AS at FROM notes WHERE id = ?')
        .get(input.noteId) as { at: number }
    ).at;
    claims.forEach((text, idx) => {
      if (kept.has(idx)) return;
      insert.run(input.noteId, idx, text, hash, validFrom, classifyClaim(text));
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

export type ClaimStatus = 'unconfirmed' | 'confirmed' | 'closed' | 'retracted';
export type ConfirmDepth = 'card' | 'evidence';

export type Claim = {
  id: number;
  noteId: number;
  idx: number;
  text: string;
  sourceHash: string;
  validFrom: number | null;
  validUntil: number | null;
  confirmedAt: number | null;
  confirmDepth: ConfirmDepth | null;
  supersededBy: number | null;
  status: ClaimStatus;
  kind: ClaimKind;
};

type ClaimRow = {
  id: number;
  note_id: number;
  idx: number;
  text: string;
  source_hash: string;
  valid_from: number | null;
  valid_until: number | null;
  confirmed_at: number | null;
  confirm_depth: ConfirmDepth | null;
  superseded_by: number | null;
  status: ClaimStatus;
  kind: ClaimKind;
};

const toClaim = (row: ClaimRow): Claim => ({
  id: row.id,
  noteId: row.note_id,
  idx: row.idx,
  text: row.text,
  sourceHash: row.source_hash,
  validFrom: row.valid_from,
  validUntil: row.valid_until,
  confirmedAt: row.confirmed_at,
  confirmDepth: row.confirm_depth,
  supersededBy: row.superseded_by,
  status: row.status,
  kind: row.kind,
});

export const getClaim = (client: MemexClient, id: number): Claim | null => {
  const row = client.sqlite.prepare('SELECT * FROM note_claims WHERE id = ?').get(id) as
    | ClaimRow
    | undefined;
  return row ? toClaim(row) : null;
};

export const listClaims = (client: MemexClient, noteIds?: number[]): Claim[] => {
  const rows =
    noteIds === undefined
      ? (client.sqlite
          .prepare('SELECT * FROM note_claims ORDER BY note_id, idx')
          .all() as ClaimRow[])
      : (client.sqlite
          .prepare(
            `SELECT * FROM note_claims WHERE note_id IN (SELECT value FROM json_each(?))
             ORDER BY note_id, idx`,
          )
          .all(JSON.stringify(noteIds)) as ClaimRow[]);
  return rows.map(toClaim);
};

// Freshness is bought at two prices. A card read on its face is worth a month; one
// read against its evidence is worth a quarter. Confirming stays one key either
// way — only what it buys differs.
export const FRESHNESS_DAYS: Record<ConfirmDepth, number> = { card: 30, evidence: 90 };

export const confirmClaim = (
  client: MemexClient,
  id: number,
  depth: ConfirmDepth,
  at = Date.now(),
): Claim | null => {
  client.sqlite
    .prepare(
      `UPDATE note_claims SET confirmed_at = ?, confirm_depth = ?, status = 'confirmed'
       WHERE id = ?`,
    )
    .run(at, depth, id);
  return getClaim(client, id);
};

export const restoreClaim = (client: MemexClient, previous: Claim): Claim | null => {
  client.sqlite
    .prepare(
      `UPDATE note_claims
       SET confirmed_at = ?, confirm_depth = ?, status = ?, valid_until = ?, superseded_by = ?
       WHERE id = ?`,
    )
    .run(
      previous.confirmedAt,
      previous.confirmDepth,
      previous.status,
      previous.validUntil,
      previous.supersededBy,
      previous.id,
    );
  return getClaim(client, previous.id);
};

// The note the claim was read out of no longer says what it said. The claim is not
// re-read: an extractor cannot tell whether the sentence survived the edit, and a
// person can.
export const claimEvidenceMoved = (client: MemexClient, claim: Claim): boolean => {
  const row = client.sqlite.prepare('SELECT content FROM notes WHERE id = ?').get(claim.noteId) as
    | { content: string }
    | undefined;
  return row === undefined || bodyHash(row.content) !== claim.sourceHash;
};

export type ClaimStanding = { confirmed: Claim[]; unconfirmed: Claim[]; closed: Claim[] };

const emptyStanding = (): ClaimStanding => ({ confirmed: [], unconfirmed: [], closed: [] });

export const claimStandingFor = (
  client: MemexClient,
  noteIds: number[],
): Map<number, ClaimStanding> =>
  listClaims(client, noteIds).reduce((acc, claim) => {
    const standing = acc.get(claim.noteId) ?? emptyStanding();
    if (claim.status === 'confirmed') standing.confirmed.push(claim);
    else if (claim.status === 'unconfirmed') standing.unconfirmed.push(claim);
    else standing.closed.push(claim);
    acc.set(claim.noteId, standing);
    return acc;
  }, new Map<number, ClaimStanding>());

// What a person's judgement is worth at retrieval. A note someone stood behind
// ranks a little higher; one whose every claim has been closed ranks lower; one
// nobody has looked at is read as slightly less certain, not as wrong.
export const CLAIM_TRUST = { confirmed: 1.1, unchecked: 0.97, closed: 0.85 } as const;

export const claimTrustFactor = (standing: ClaimStanding | undefined): number => {
  if (!standing) return 1;
  if (standing.confirmed.length > 0) return CLAIM_TRUST.confirmed;
  if (standing.unconfirmed.length === 0 && standing.closed.length > 0) return CLAIM_TRUST.closed;
  if (standing.unconfirmed.length > 0) return CLAIM_TRUST.unchecked;
  return 1;
};

// A person saying the deck asked the wrong kind of question. Kept as a property
// of the claim rather than a dismissal, so it also stops being asked in future
// sessions and shows up in what the agent reads.
export const setClaimKind = (client: MemexClient, id: number, kind: ClaimKind): Claim | null => {
  client.sqlite.prepare('UPDATE note_claims SET kind = ? WHERE id = ?').run(kind, id);
  return getClaim(client, id);
};
