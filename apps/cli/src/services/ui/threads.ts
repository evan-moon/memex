import { type MemexClient, parseTags } from '@memex/db';

export type ThreadStep = {
  id: number;
  title: string;
  layer: string;
  at: number;
  children: ThreadStep[];
};

export type ThreadRef = {
  rootId: number;
  title: string;
  steps: number;
  branches: number;
  startedAt: number;
  lastAt: number;
  tags: string[];
};

export type Thread = ThreadRef & { root: ThreadStep };

type Row = { id: number; title: string; layer: string; at: number; tags: string };

const AMENDMENT_PREFIX = /^\[Amendment(?:\s+\d+)?\]\s*/;

// The tree already says a step is the third correction, so the prefix the
// title carries for search results is noise once it is in place.
const stepTitle = (title: string) => title.replace(AMENDMENT_PREFIX, '').trim() || title;

const notesById = (client: MemexClient) =>
  new Map(
    (
      client.sqlite
        .prepare(
          `SELECT id, title, layer, tags, COALESCE(authored_at, created_at) AS at FROM notes`,
        )
        .all() as Row[]
    ).map((row) => [row.id, row]),
  );

const amendEdges = (client: MemexClient) => {
  const rows = client.sqlite
    .prepare("SELECT source_id, target_id FROM note_links WHERE source = 'amends'")
    .all() as { source_id: number; target_id: number }[];

  return rows.reduce(
    (acc, { source_id, target_id }) => ({
      children: acc.children.set(target_id, [...(acc.children.get(target_id) ?? []), source_id]),
      parent: acc.parent.set(source_id, target_id),
    }),
    { children: new Map<number, number[]>(), parent: new Map<number, number>() },
  );
};

const rootOf = (parent: Map<number, number>, id: number) => {
  const seen = new Set<number>();
  const climb = (at: number): number => {
    const up = parent.get(at);
    if (up === undefined || seen.has(up)) return at;
    seen.add(up);
    return climb(up);
  };
  return climb(id);
};

const growFrom = (
  notes: Map<number, Row>,
  children: Map<number, number[]>,
  id: number,
  seen: Set<number>,
): ThreadStep | null => {
  const note = notes.get(id);
  if (!note || seen.has(id)) return null;
  seen.add(id);

  return {
    id: note.id,
    title: stepTitle(note.title),
    layer: note.layer,
    at: note.at,
    children: (children.get(id) ?? [])
      .flatMap((child) => growFrom(notes, children, child, seen) ?? [])
      .sort((a, b) => a.at - b.at),
  };
};

const flatten = (step: ThreadStep): ThreadStep[] => [
  step,
  ...step.children.flatMap((child) => flatten(child)),
];

const refOf = (root: ThreadStep, tags: string[]): ThreadRef => {
  const all = flatten(root);
  return {
    rootId: root.id,
    title: root.title,
    steps: all.length,
    branches: all.filter((step) => step.children.length > 1).length,
    startedAt: root.at,
    lastAt: Math.max(...all.map((step) => step.at)),
    tags,
  };
};

const tagsAcross = (notes: Map<number, Row>, root: ThreadStep) => [
  ...new Set(flatten(root).flatMap((step) => parseTags(notes.get(step.id)?.tags ?? '[]'))),
];

export const buildThread = (client: MemexClient, noteId: number): Thread | null => {
  const { children, parent } = amendEdges(client);
  if (!children.has(noteId) && !parent.has(noteId)) return null;

  const notes = notesById(client);
  const root = growFrom(notes, children, rootOf(parent, noteId), new Set());
  if (!root) return null;

  return { ...refOf(root, tagsAcross(notes, root)), root };
};

// Most recently moved first: a thread someone corrected this week is the one
// still being argued, whatever its size.
export const listThreads = (client: MemexClient): ThreadRef[] => {
  const { children, parent } = amendEdges(client);
  const notes = notesById(client);
  const roots = [...new Set([...children.keys(), ...parent.keys()])].filter(
    (id) => !parent.has(id),
  );

  return roots
    .flatMap((id) => {
      const root = growFrom(notes, children, id, new Set());
      return root ? [refOf(root, tagsAcross(notes, root))] : [];
    })
    .sort((a, b) => b.lastAt - a.lastAt);
};
