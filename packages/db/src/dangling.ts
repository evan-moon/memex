import { withinEditDistance } from '@memex/utils';
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
  const nearest =
    allowed === 0
      ? undefined
      : titles.find(
          (title) =>
            title.toLowerCase() !== link.target.toLowerCase() &&
            withinEditDistance(title.toLowerCase(), link.target.toLowerCase(), allowed),
        );

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

// Classified once against every title, so a screen and the detector cannot
// disagree about what kind of dead link a note has.
export const danglingLinks = (client: MemexClient): DanglingLink[] => {
  const dismissed = new Set(dismissedDanglingNoteIds(client));
  const titles = (
    client.sqlite.prepare('SELECT title FROM notes').all() as { title: string }[]
  ).map((r) => r.title);
  const paths = new Map(
    (
      client.sqlite.prepare('SELECT id, file_path AS filePath FROM notes').all() as {
        id: number;
        filePath: string;
      }[]
    ).map((r) => [r.id, r.filePath]),
  );

  return [...unresolvedLinksByNote(client).entries()]
    .filter(([noteId]) => !dismissed.has(noteId))
    .flatMap(([noteId, targets]) =>
      targets.map((target) =>
        classifyDangling({ noteId, target, filePath: paths.get(noteId) ?? '' }, titles),
      ),
    );
};
