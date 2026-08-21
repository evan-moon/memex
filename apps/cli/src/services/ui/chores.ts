import {
  getNote,
  listSignals,
  type MemexClient,
  notesDeclaringEvidence,
  refreshSignals,
  unresolvedLinksByNote,
} from '@memex/db';
import { listTags, mergeCandidates } from '../tidy.ts';

const TOP = 5;

export type StaleNote = { id: number; title: string; count: number };
export type DeadLinkNote = { id: number; title: string; targets: string[] };
export type TagPair = { keep: string; drop: string[] };

export type Undeclared = { id: number; title: string; candidates: number };

export type Chores = {
  undeclared: { total: number; top: Undeclared[] };
  staleNotes: { total: number; top: StaleNote[] };
  deadLinks: { total: number; notes: number; top: DeadLinkNote[] };
  tagMerges: { total: number; top: TagPair[] };
  looseTags: { total: number; all: number; top: string[] };
};

const staleNotes = (client: MemexClient) => {
  const found = listSignals(client, { type: 'stale_state', status: 'new' }).flatMap((signal) => {
    const [stateId, ...newer] = signal.evidenceIds;
    if (stateId === undefined) return [];
    const note = getNote(client, stateId);
    return note ? [{ id: note.id, title: note.title, count: newer.length }] : [];
  });
  return {
    total: found.length,
    top: [...found].sort((a, b) => b.count - a.count || b.id - a.id).slice(0, TOP),
  };
};

const deadLinks = (client: MemexClient) => {
  const byNote = [...unresolvedLinksByNote(client)];
  const top = byNote
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, TOP)
    .flatMap(([id, targets]) => {
      const note = getNote(client, id);
      return note ? [{ id: note.id, title: note.title, targets }] : [];
    });

  return {
    total: byNote.reduce((acc, [, targets]) => acc + targets.length, 0),
    notes: byNote.length,
    top,
  };
};

// A projection that has not said what it stands on can only be checked by
// guessing. Counting them is how the guessing shrinks.
const undeclared = (client: MemexClient) => {
  const declared = new Set(notesDeclaringEvidence(client));
  const rows = (
    client.sqlite
      .prepare(
        `SELECT n.id, n.title, COUNT(l.target_id) AS candidates
         FROM notes n
         LEFT JOIN note_links l ON l.source_id = n.id AND l.source = 'wiki'
         WHERE n.layer = 'state' AND n.author = 'person'
         GROUP BY n.id
         ORDER BY candidates DESC, n.updated_at DESC`,
      )
      .all() as Undeclared[]
  ).filter((row) => !declared.has(row.id));

  return { total: rows.length, top: rows.slice(0, TOP) };
};

export const buildChores = (client: MemexClient, vaultPath: string): Chores => {
  refreshSignals(client);
  const merges = mergeCandidates(client, vaultPath);
  const loose = listTags(client, vaultPath).filter((row) => row.notes === 1);
  const mine = loose.filter((row) => row.mine > 0);

  return {
    undeclared: undeclared(client),
    staleNotes: staleNotes(client),
    deadLinks: deadLinks(client),
    tagMerges: {
      total: merges.length,
      top: merges.slice(0, TOP).map(({ keep, drop }) => ({ keep, drop })),
    },
    looseTags: {
      total: mine.length,
      all: loose.length,
      top: mine.slice(0, TOP).map((row) => row.tag),
    },
  };
};
