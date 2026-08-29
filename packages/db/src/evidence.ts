import { createHash } from 'node:crypto';
import { stripFrontmatter } from '@memex/utils';
import type { MemexClient } from './client.ts';

// What a state note was built from, and what those notes said at the time.
// A projection that does not name its sources can only be checked by guessing
// which notes look related; one that names them can be checked by comparison.
export type Evidence = {
  sourceId: number;
  sourceHash: string;
  declaredAt: number;
};

export type EvidenceEdge = Evidence & {
  title: string | null;
  /** The source's body no longer matches what it said when it was declared. */
  changed: boolean;
  /** A later note corrects this source. */
  amendedBy: { id: number; title: string } | null;
  missing: boolean;
};

// Frontmatter is metadata about the note, not something it claims — retagging
// a source is not a reason to call every projection built on it out of date.
export const bodyHash = (content: string): string =>
  createHash('sha256').update(stripFrontmatter(content).trim()).digest('hex');

type Row = { note_id: number; source_id: number; source_hash: string; declared_at: number };

const toEvidence = (row: Row): Evidence => ({
  sourceId: row.source_id,
  sourceHash: row.source_hash,
  declaredAt: row.declared_at,
});

export const getNoteEvidence = (client: MemexClient, noteId: number): Evidence[] =>
  (
    client.sqlite
      .prepare('SELECT * FROM note_evidence WHERE note_id = ? ORDER BY source_id')
      .all(noteId) as Row[]
  ).map(toEvidence);

// Declared as a set, so removing a source is the same call as adding one. Each
// source's body is hashed as it stands now, which is what the declaration
// means: this projection accounts for these notes as they read today.
export const setNoteEvidence = (
  client: MemexClient,
  noteId: number,
  sourceIds: number[],
): Evidence[] => {
  const now = Date.now();
  const wanted = [...new Set(sourceIds)].filter((id) => id !== noteId);

  const read = client.sqlite.prepare('SELECT content FROM notes WHERE id = ?');
  const insert = client.sqlite.prepare(
    'INSERT OR REPLACE INTO note_evidence(note_id, source_id, source_hash, declared_at) VALUES (?, ?, ?, ?)',
  );

  client.sqlite.transaction(() => {
    client.sqlite.prepare('DELETE FROM note_evidence WHERE note_id = ?').run(noteId);
    for (const sourceId of wanted) {
      const row = read.get(sourceId) as { content: string } | undefined;
      if (row) insert.run(noteId, sourceId, bodyHash(row.content), now);
    }
  })();

  return getNoteEvidence(client, noteId);
};

// The file says which sources a note names; this makes the index agree without
// touching the hashes of edges that were already there. Re-hashing here would
// quietly accept every change the comparison exists to catch.
export const syncNoteEvidence = (
  client: MemexClient,
  noteId: number,
  sourceIds: number[],
): Evidence[] => {
  const wanted = new Set([...new Set(sourceIds)].filter((id) => id !== noteId));
  const existing = new Set(getNoteEvidence(client, noteId).map((e) => e.sourceId));
  const now = Date.now();

  const read = client.sqlite.prepare('SELECT content FROM notes WHERE id = ?');
  const insert = client.sqlite.prepare(
    'INSERT OR IGNORE INTO note_evidence(note_id, source_id, source_hash, declared_at) VALUES (?, ?, ?, ?)',
  );
  const remove = client.sqlite.prepare(
    'DELETE FROM note_evidence WHERE note_id = ? AND source_id = ?',
  );

  client.sqlite.transaction(() => {
    for (const sourceId of existing) if (!wanted.has(sourceId)) remove.run(noteId, sourceId);
    for (const sourceId of wanted) {
      if (existing.has(sourceId)) continue;
      const row = read.get(sourceId) as { content: string } | undefined;
      if (row) insert.run(noteId, sourceId, bodyHash(row.content), now);
    }
  })();

  return getNoteEvidence(client, noteId);
};

export const notesDeclaringEvidence = (client: MemexClient): number[] =>
  (
    client.sqlite.prepare('SELECT DISTINCT note_id FROM note_evidence').all() as {
      note_id: number;
    }[]
  ).map((row) => row.note_id);

export const evidenceFor = (client: MemexClient, noteId: number): EvidenceEdge[] =>
  getNoteEvidence(client, noteId).map((evidence) => {
    const source = client.sqlite
      .prepare('SELECT title, content FROM notes WHERE id = ?')
      .get(evidence.sourceId) as { title: string; content: string } | undefined;

    const amendment = client.sqlite
      .prepare(
        `SELECT n.id, n.title FROM note_links l JOIN notes n ON n.id = l.source_id
         WHERE l.source IN ('amends', 'corrects', 'continues') AND l.target_id = ?
         ORDER BY COALESCE(n.authored_at, n.created_at) DESC LIMIT 1`,
      )
      .get(evidence.sourceId) as { id: number; title: string } | undefined;

    return {
      ...evidence,
      title: source?.title ?? null,
      missing: source === undefined,
      changed: source !== undefined && bodyHash(source.content) !== evidence.sourceHash,
      amendedBy: amendment ?? null,
    };
  });

export type Staleness = {
  amended: { source: EvidenceEdge; by: { id: number; title: string } }[];
  changed: EvidenceEdge[];
  missing: EvidenceEdge[];
};

// Null when the note declares nothing — there is no comparison to make, and
// the guessing detector still covers it.
export const evidenceStaleness = (client: MemexClient, noteId: number): Staleness | null => {
  const edges = evidenceFor(client, noteId);
  if (edges.length === 0) return null;

  return {
    amended: edges.flatMap((edge) =>
      edge.amendedBy ? [{ source: edge, by: edge.amendedBy }] : [],
    ),
    changed: edges.filter((edge) => edge.changed),
    missing: edges.filter((edge) => edge.missing),
  };
};

export const isStale = (staleness: Staleness | null): boolean =>
  staleness !== null &&
  staleness.amended.length + staleness.changed.length + staleness.missing.length > 0;
