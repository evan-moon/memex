import { findNearest } from '@memex/utils';
import type { MemexClient } from './client.ts';
import { unresolvedLinksByNote } from './link-index.ts';

export type DanglingKind = 'placeholder' | 'typo' | 'forward';

export type DanglingLink = {
  noteId: number;
  target: string;
  kind: DanglingKind;
  nearest?: string;
};

// Distance has to be read against length: at 2, every two-character string is
// a "typo" of every other, which turned 링크 into 강훈.
const typoDistance = (target: string) => Math.min(2, Math.floor([...target].length / 4));

// The link conventions in CLAUDE.md and the design docs spell out the forms NOT
// to use — [[Title]], [[1234]], [[some-memory-key]] — and the detector reads
// those counterexamples as broken links. They are prose about links, not links.
const PLACEHOLDER_TARGETS = new Set([
  'title',
  'exact note title',
  'title|display text',
  'some-memory-key',
  'label',
  'name',
  'note title',
  'their name',
  '링크',
  '제목',
  '이름',
  '노트 제목',
  '레이블',
]);

const isPlaceholderTarget = (target: string) => {
  const normalized = target.trim().toLowerCase();
  return (
    PLACEHOLDER_TARGETS.has(normalized) ||
    /^\d+$/.test(normalized) ||
    /^(path\/)?note\.md$/.test(normalized)
  );
};

// A source that is a rule or a plan document is writing about the vault rather
// than in it, so its unresolved links are examples by default.
const isDocumentSource = (filePath: string) =>
  /(^|\/)(CLAUDE|README|AGENTS)\.md$/i.test(filePath) || /(^|\/)docs\//.test(filePath);

export const classifyDangling = (
  link: { noteId: number; target: string; filePath: string },
  titles: string[],
): DanglingLink => {
  if (isPlaceholderTarget(link.target) || isDocumentSource(link.filePath))
    return { noteId: link.noteId, target: link.target, kind: 'placeholder' };

  const allowed = typoDistance(link.target);
  const nearest = allowed === 0 ? undefined : findNearest(link.target, titles, allowed);

  return nearest
    ? { noteId: link.noteId, target: link.target, kind: 'typo', nearest }
    : { noteId: link.noteId, target: link.target, kind: 'forward' };
};

export const dismissDanglingFor = (client: MemexClient, noteId: number, at = Date.now()) => {
  client.sqlite
    .prepare(
      `INSERT INTO dangling_dismissed (note_id, at) VALUES (?, ?)
       ON CONFLICT(note_id) DO UPDATE SET at = excluded.at`,
    )
    .run(noteId, at);
};

export const restoreDanglingFor = (client: MemexClient, noteId: number) => {
  client.sqlite.prepare('DELETE FROM dangling_dismissed WHERE note_id = ?').run(noteId);
};

export const dismissedDanglingNoteIds = (client: MemexClient): number[] =>
  (
    client.sqlite.prepare('SELECT note_id AS noteId FROM dangling_dismissed').all() as {
      noteId: number;
    }[]
  ).map((r) => r.noteId);

// A title too long or too short to be reachable within the allowed distance
// cannot be the one that was meant, and the length check inside the matrix
// would only reject it after the row has already been read. Rejecting by an
// indexed range first means a link is measured against a handful of plausible
// titles rather than against the whole vault.
const NEARBY_TITLES = `SELECT title FROM notes
   WHERE LENGTH(title) BETWEEN ? AND ?
   ORDER BY id`;

const nearbyTitles = (client: MemexClient) => {
  const query = client.sqlite.prepare(NEARBY_TITLES);

  return (target: string) => {
    const allowed = typoDistance(target);
    if (allowed === 0) return [];
    const length = [...target].length;
    return (query.all(length - allowed, length + allowed) as { title: string }[]).map(
      (row) => row.title,
    );
  };
};

const PATH_BATCH = 500;

const pathsFor = (client: MemexClient, ids: number[]) => {
  const read = (batch: number[]) =>
    client.sqlite
      .prepare(
        `SELECT id, file_path AS filePath FROM notes WHERE id IN (${batch.map(() => '?').join(',')})`,
      )
      .all(...batch) as { id: number; filePath: string }[];

  const batches = Array.from({ length: Math.ceil(ids.length / PATH_BATCH) }, (_, i) =>
    ids.slice(i * PATH_BATCH, (i + 1) * PATH_BATCH),
  );

  return new Map(batches.flatMap(read).map((row) => [row.id, row.filePath]));
};

// Classified against the same titles a screen would offer, so a screen and the
// detector cannot disagree about what kind of dead link a note has.
export const danglingLinks = (client: MemexClient): DanglingLink[] => {
  const dismissed = new Set(dismissedDanglingNoteIds(client));
  const dead = [...unresolvedLinksByNote(client).entries()].filter(
    ([noteId]) => !dismissed.has(noteId),
  );
  if (dead.length === 0) return [];

  const paths = pathsFor(
    client,
    dead.map(([noteId]) => noteId),
  );
  const nearby = nearbyTitles(client);

  return dead.flatMap(([noteId, targets]) =>
    targets.map((target) =>
      classifyDangling({ noteId, target, filePath: paths.get(noteId) ?? '' }, nearby(target)),
    ),
  );
};
