import { createHash } from 'node:crypto';
import type { MemexClient } from './client.ts';

// Lv2 inferences: LLM-synthesized hypotheses derived from notes.
//
// Design principles enforced here:
// - An inference is a HYPOTHESIS, not a note. It lives in its own tables and is
//   never returned by note search, so a later synthesis can never consume a
//   previous inference as if it were a primary source (model collapse).
// - PROVENANCE is mandatory: every inference records which notes it was built
//   from, plus each note's content hash at mint time and the model/prompt used.
// - INVALIDATION is deterministic: if a source note's content changes or the
//   note disappears, the inference goes stale via a pure hash comparison — no
//   LLM needed to notice it rotted.
// - memex does NOT call an LLM. Synthesis happens in the agent; this layer only
//   persists the result with its provenance.

export type InferenceStatus = 'active' | 'stale' | 'archived';
export type EvidenceRole = 'source' | 'supports';

export type Inference = {
  id: number;
  title: string;
  summary: string;
  confidence: number | null;
  status: InferenceStatus;
  modelId: string | null;
  promptVersion: string | null;
  createdAt: number;
  updatedAt: number;
};

export type EvidenceInput = { noteId: number; role?: EvidenceRole };

export type EvidenceEdge = {
  noteId: number;
  role: EvidenceRole;
  sourceHash: string;
  sourceExcerpt: string | null; // note content snapshot at mint time
  // Resolved at read time:
  title: string | null;
  changed: boolean; // current content hash != sourceHash
  missing: boolean; // note no longer exists
};

const EXCERPT_CHARS = 280;
const excerptOf = (content: string): string =>
  content.length <= EXCERPT_CHARS ? content : `${content.slice(0, EXCERPT_CHARS)}…`;

export type MintInferenceInput = {
  title: string;
  summary: string;
  evidence: EvidenceInput[];
  confidence?: number;
  modelId?: string;
  promptVersion?: string;
  fromSignalId?: number;
};

type InferenceRow = {
  id: number;
  title: string;
  summary: string;
  confidence: number | null;
  status: InferenceStatus;
  model_id: string | null;
  prompt_version: string | null;
  created_at: number;
  updated_at: number;
};

const rowToInference = (r: InferenceRow): Inference => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  confidence: r.confidence,
  status: r.status,
  modelId: r.model_id,
  promptVersion: r.prompt_version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const noteContentHash = (content: string): string =>
  createHash('sha256').update(content).digest('hex');

const noteSnapshotFor = (
  client: MemexClient,
  noteId: number,
): { hash: string; excerpt: string } | null => {
  const row = client.sqlite.prepare('SELECT content FROM notes WHERE id = ?').get(noteId) as
    | { content: string }
    | undefined;
  return row ? { hash: noteContentHash(row.content), excerpt: excerptOf(row.content) } : null;
};

// Persist an LLM-synthesized inference with full provenance. The summary/title
// must already have been produced by the agent — this function does no
// synthesis. If fromSignalId is given, that signal is marked 'minted'.
export const mintInference = (client: MemexClient, input: MintInferenceInput): Inference => {
  const now = Date.now();
  const tx = client.sqlite.transaction(() => {
    const { lastInsertRowid } = client.sqlite
      .prepare(
        `INSERT INTO inferences
           (title, summary, confidence, status, model_id, prompt_version, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
      )
      .run(
        input.title,
        input.summary,
        input.confidence ?? null,
        input.modelId ?? null,
        input.promptVersion ?? null,
        now,
        now,
      );
    const inferenceId = Number(lastInsertRowid);

    const insertEdge = client.sqlite.prepare(
      `INSERT OR IGNORE INTO inference_evidence
         (inference_id, note_id, role, source_hash, source_excerpt)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const ev of input.evidence) {
      const snap = noteSnapshotFor(client, ev.noteId);
      if (snap === null) continue; // can't mint from a note that doesn't exist
      insertEdge.run(inferenceId, ev.noteId, ev.role ?? 'source', snap.hash, snap.excerpt);
    }

    if (input.fromSignalId !== undefined) {
      client.sqlite
        .prepare("UPDATE signals SET status = 'minted', updated_at = ? WHERE id = ?")
        .run(now, input.fromSignalId);
    }

    return inferenceId;
  });

  const id = tx();
  return getInference(client, id)!.inference;
};

export const getInference = (
  client: MemexClient,
  id: number,
): { inference: Inference; evidence: EvidenceEdge[] } | undefined => {
  const row = client.sqlite.prepare('SELECT * FROM inferences WHERE id = ?').get(id) as
    | InferenceRow
    | undefined;
  if (!row) return undefined;

  const edges = client.sqlite
    .prepare(
      `SELECT ie.note_id, ie.role, ie.source_hash, ie.source_excerpt, n.content, n.title
       FROM inference_evidence ie
       LEFT JOIN notes n ON n.id = ie.note_id
       WHERE ie.inference_id = ?
       ORDER BY ie.note_id`,
    )
    .all(id) as {
    note_id: number;
    role: EvidenceRole;
    source_hash: string;
    source_excerpt: string | null;
    content: string | null;
    title: string | null;
  }[];

  const evidence: EvidenceEdge[] = edges.map((e) => ({
    noteId: e.note_id,
    role: e.role,
    sourceHash: e.source_hash,
    sourceExcerpt: e.source_excerpt,
    title: e.title,
    missing: e.content === null,
    changed: e.content !== null && noteContentHash(e.content) !== e.source_hash,
  }));

  return { inference: rowToInference(row), evidence };
};

// Reads the stored status column only (cheap). The status can lag reality
// until invalidation runs, so callers that need a truthful active/stale view
// should call refreshInferenceStaleness first (the CLI does before listing).
export const listInferences = (
  client: MemexClient,
  options: { status?: InferenceStatus } = {},
): Inference[] => {
  const clause = options.status ? 'WHERE status = ?' : '';
  const args = options.status ? [options.status] : [];
  const rows = client.sqlite
    .prepare(`SELECT * FROM inferences ${clause} ORDER BY created_at DESC`)
    .all(...args) as InferenceRow[];
  return rows.map(rowToInference);
};

// Deterministically check whether an inference has rotted: any evidence note
// missing or content-changed since mint. Flips active<->stale accordingly and
// returns the verdict. Archived inferences are left untouched.
export const checkInferenceStale = (
  client: MemexClient,
  id: number,
): { stale: boolean; changedNoteIds: number[] } | undefined => {
  const found = getInference(client, id);
  if (!found) return undefined;
  if (found.inference.status === 'archived') {
    return {
      stale: false,
      changedNoteIds: found.evidence.filter((e) => e.changed || e.missing).map((e) => e.noteId),
    };
  }

  const changedNoteIds = found.evidence.filter((e) => e.changed || e.missing).map((e) => e.noteId);
  const stale = changedNoteIds.length > 0;
  const nextStatus: InferenceStatus = stale ? 'stale' : 'active';

  if (nextStatus !== found.inference.status) {
    client.sqlite
      .prepare('UPDATE inferences SET status = ?, updated_at = ? WHERE id = ?')
      .run(nextStatus, Date.now(), id);
  }
  return { stale, changedNoteIds };
};

// Re-check every non-archived inference; returns the ids now stale.
export const refreshInferenceStaleness = (client: MemexClient): number[] => {
  const rows = client.sqlite
    .prepare("SELECT id FROM inferences WHERE status != 'archived'")
    .all() as { id: number }[];
  const stale: number[] = [];
  for (const { id } of rows) {
    if (checkInferenceStale(client, id)?.stale) stale.push(id);
  }
  return stale;
};

export const setInferenceStatus = (
  client: MemexClient,
  id: number,
  status: InferenceStatus,
): Inference | undefined => {
  client.sqlite
    .prepare('UPDATE inferences SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
  const row = client.sqlite.prepare('SELECT * FROM inferences WHERE id = ?').get(id) as
    | InferenceRow
    | undefined;
  return row ? rowToInference(row) : undefined;
};
