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
  supersededBy: NoteRef[];
  corrects: NoteRef[];
  backlinks: NoteRef[];
  related: NoteRef[];
};

const toRef = (n: {
  id: number;
  title: string;
  layer: string;
  authoredAt: number | null;
  createdAt: number;
}): NoteRef => ({ id: n.id, title: n.title, layer: n.layer, at: n.authoredAt ?? n.createdAt });

// Obsidian can only open what is inside the vault it has open; notes indexed
// from other roots get their path shown instead of a link that would fail.
const obsidianUrl = (filePath: string, vaultPath: string): string | null => {
  if (!filePath.startsWith(`${vaultPath}/`)) return null;
  const rel = filePath.slice(vaultPath.length + 1);
  return `obsidian://open?vault=${encodeURIComponent(basename(vaultPath))}&file=${encodeURIComponent(rel.replace(/\.md$/, ''))}`;
};

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
      .all(id) as Parameters<typeof toRef>[0][]
  ).map(toRef);

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    layer: note.layer,
    at: note.authoredAt ?? note.createdAt,
    tags: parseTags(note.tags),
    obsidianUrl: obsidianUrl(note.filePath, vaultPath),
    filePath: note.filePath,
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

export const listByLayer = (client: MemexClient, layer: NoteLayer, limit = 500): NoteRef[] =>
  (
    client.sqlite
      .prepare(
        `SELECT id, title, layer, authored_at AS authoredAt, created_at AS createdAt
         FROM notes WHERE layer = ?
         ORDER BY COALESCE(authored_at, created_at) DESC LIMIT ?`,
      )
      .all(layer, limit) as Parameters<typeof toRef>[0][]
  ).map(toRef);

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
