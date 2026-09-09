import { getDocumentMeta, type MemexClient } from '@memex/db';
import { writerOf } from './authorship.ts';

// What the home screen answers, in the order the design puts it: what was I in
// the middle of, what have I touched lately, and — only then — what changed
// underneath that needs me.
//
// The review deck is not the day's work here. It is reachable on its own and
// from the document it concerns, and what appears on the home screen is the
// handful of changes that touch what somebody was actually working on.
export type HomeDocument = {
  id: number;
  title: string;
  folder: string;
  updatedAt: number;
  snippet: string;
};

export type Home = {
  continuing: HomeDocument | null;
  recent: HomeDocument[];
  // Empty means the section is left out entirely rather than shown empty.
  changes: { id: number; title: string; why: string }[];
};

type Row = {
  id: number;
  title: string;
  folder: string;
  updated_at: number;
  content: string;
  source: string;
};

const RECENT = 8;

const asDocument = (row: Row): HomeDocument => ({
  id: row.id,
  title: row.title,
  folder: row.folder,
  updatedAt: row.updated_at,
  // The last thing they were looking at, not the note's opening. A home screen
  // that shows the first line of every document shows the same line every time.
  snippet: row.content
    .replace(/^---[\s\S]*?\n---\n/, '')
    .trim()
    .slice(0, 140),
});

export const buildHome = (client: MemexClient): Home => {
  const rows = client.sqlite
    .prepare(
      `SELECT id, title, COALESCE(category, '') AS folder, updated_at, content, source
       FROM notes ORDER BY updated_at DESC LIMIT 40`,
    )
    .all() as Row[];

  // What a person was in the middle of, which is not the same as what changed
  // most recently — an agent writing a memory does not put the person back in
  // the middle of anything.
  const theirs = rows.filter(
    (row) =>
      writerOf(row.source) === 'person' || getDocumentMeta(client, row.id).origin === 'person',
  );

  const continuing = theirs[0] ?? null;

  return {
    continuing: continuing === null ? null : asDocument(continuing),
    // The list says what it is sorted by. Mixing "recently changed" with
    // "recently opened" makes a list nobody can predict.
    recent: theirs
      .filter((row) => row.id !== continuing?.id)
      .slice(0, RECENT)
      .map(asDocument),
    changes: [],
  };
};
