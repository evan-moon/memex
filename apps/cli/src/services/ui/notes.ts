import { basename } from 'node:path';
import {
  findRelatedNotes,
  getAmendments,
  getBacklinks,
  getNote,
  type MemexClient,
  type NoteLayer,
  parseTags,
} from '@memex/db';

export type NoteRef = { id: number; title: string; layer: string; at: number };

export type NoteDetail = {
  id: number;
  title: string;
  content: string;
  layer: NoteLayer;
  at: number;
  tags: string[];
  obsidianUrl: string | null;
  filePath: string;
  wikiLinks: { title: string; id: number }[];
  supersededBy: NoteRef[];
  corrects: NoteRef[];
  backlinks: NoteRef[];
  related: NoteRef[];
};

// Queries that select whole rows hand back snake_case keys at runtime whatever
// the camelCase type says, so a ref built from only the camel names loses its
// date — and a missing date is what blanked the note screen.
type RawNote = {
  id: number;
  title: string;
  layer: string;
  authoredAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  authored_at?: number | null;
  created_at?: number;
  updated_at?: number;
};

const toRef = (n: RawNote): NoteRef => ({
  id: n.id,
  title: n.title,
  layer: n.layer,
  at: n.authoredAt ?? n.authored_at ?? n.createdAt ?? n.created_at ?? 0,
});

const toStateRef = (n: RawNote): NoteRef => ({
  ...toRef(n),
  at: n.updatedAt ?? n.updated_at ?? toRef(n).at,
});

// Obsidian can only open what is inside the vault it has open; notes indexed
// from other roots get their path shown instead of a link that would fail.
const obsidianUrl = (filePath: string, vaultPath: string): string | null => {
  if (!filePath.startsWith(`${vaultPath}/`)) return null;
  const rel = filePath.slice(vaultPath.length + 1);
  return `obsidian://open?vault=${encodeURIComponent(basename(vaultPath))}&file=${encodeURIComponent(rel.replace(/\.md$/, ''))}`;
};

// A note's stored content is the file as it sits on disk, so most of it opens
// with YAML frontmatter and then repeats the title as an H1. Rendered as text
// that was merely noise; rendered as Markdown it becomes a stray rule, a
// paragraph of metadata, and the title twice. The reader wants the body.
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/;

export const bodyOf = (content: string, title: string): string => {
  const withoutFrontmatter = content.replace(FRONTMATTER, '').replace(/^\s*\r?\n/, '');
  const heading = /^#[ \t]+(.+?)[ \t]*\r?\n/.exec(withoutFrontmatter);
  return heading && heading[1].trim() === title.trim()
    ? withoutFrontmatter.slice(heading[0].length).replace(/^\s*\r?\n/, '')
    : withoutFrontmatter;
};

const outgoingWikiLinks = (client: MemexClient, id: number) =>
  client.sqlite
    .prepare(
      `SELECT n.id, n.title
       FROM note_links l JOIN notes n ON n.id = l.target_id
       WHERE l.source_id = ? AND l.source = 'wiki'`,
    )
    .all(id) as { title: string; id: number }[];

export const noteDetail = (
  client: MemexClient,
  id: number,
  vaultPath: string,
): NoteDetail | null => {
  const note = getNote(client, id);
  if (!note) return null;

  const corrects = (
    client.sqlite
      .prepare(
        `SELECT n.id, n.title, n.layer, n.authored_at AS authoredAt, n.created_at AS createdAt
         FROM note_links l JOIN notes n ON n.id = l.target_id
         WHERE l.source_id = ? AND l.source = 'amends'`,
      )
      .all(id) as RawNote[]
  ).map(toRef);

  return {
    id: note.id,
    title: note.title,
    content: bodyOf(note.content, note.title),
    layer: note.layer,
    at: note.authoredAt ?? note.createdAt,
    tags: parseTags(note.tags),
    obsidianUrl: obsidianUrl(note.filePath, vaultPath),
    filePath: note.filePath,
    wikiLinks: outgoingWikiLinks(client, id),
    supersededBy: getAmendments(client, id).map((a) => ({
      id: a.id,
      title: a.title,
      layer: 'past',
      at: a.authoredAt,
    })),
    corrects,
    backlinks: getBacklinks(client, id).map(toRef),
    related: findRelatedNotes(client, id, 5).map(toRef),
  };
};

// `state` is what is believed now, so its recency is the last time it was
// touched — and that is the same clock the stale_state signal reads, so the
// order and the warning stop disagreeing about which notes are recent. A
// `past` note records something that happened, so it sorts by when it
// happened, whatever date a later edit carries.
const recencyColumn = (layer: NoteLayer) =>
  layer === 'state' ? 'updated_at' : 'COALESCE(authored_at, created_at)';

export const listByLayer = (client: MemexClient, layer: NoteLayer, limit = 5000): NoteRef[] =>
  (
    client.sqlite
      .prepare(
        `SELECT id, title, layer, authored_at AS authoredAt, created_at AS createdAt,
                updated_at AS updatedAt
         FROM notes WHERE layer = ?
         ORDER BY ${recencyColumn(layer)} DESC LIMIT ?`,
      )
      .all(layer, limit) as RawNote[]
  ).map(layer === 'state' ? toStateRef : toRef);

export const layerCounts = (client: MemexClient): Record<string, number> =>
  (
    client.sqlite.prepare('SELECT layer, COUNT(*) AS c FROM notes GROUP BY layer').all() as {
      layer: string;
      c: number;
    }[]
  ).reduce((acc, r) => ({ ...acc, [r.layer]: r.c }), {});

// A stale_state signal cites the state note first and the newer notes that
// outdate it after — flagging all of them would put a warning on the very
// records that prove the first one stale.
export const staleStateIds = (client: MemexClient): number[] => {
  const rows = client.sqlite
    .prepare("SELECT evidence_ids FROM signals WHERE type = 'stale_state' AND status = 'new'")
    .all() as { evidence_ids: string }[];
  return [
    ...new Set(
      rows.flatMap((r) => {
        try {
          const [stateNote] = JSON.parse(r.evidence_ids) as number[];
          return stateNote === undefined ? [] : [stateNote];
        } catch {
          return [];
        }
      }),
    ),
  ];
};
