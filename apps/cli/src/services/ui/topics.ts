import { listSignals, type MemexClient } from '@memex/db';

const MIN_USES = 20;
const BUCKETS = 40;
const GAP_DAYS = 60;
const DORMANT_DAYS = 90;
const DAY = 86_400_000;

export type Marker = {
  kind: 'correction' | 'return' | 'arc';
  at: number;
  bucket: number;
  noteId: number;
  title: string;
  detail: string;
};

export type Topic = {
  tag: string;
  count: number;
  firstAt: number;
  lastAt: number;
  dormant: boolean;
  buckets: number[];
  markers: Marker[];
};

type TopicNote = { id: number; title: string; layer: string; at: number };

const notesForTag = (client: MemexClient, tag: string): TopicNote[] =>
  client.sqlite
    .prepare(
      `SELECT n.id, n.title, n.layer, COALESCE(n.authored_at, n.created_at) AS at
       FROM notes n, json_each(n.tags) j
       WHERE j.value = ?
       ORDER BY at`,
    )
    .all(tag) as TopicNote[];

const bucketOf = (at: number, firstAt: number, span: number): number =>
  span <= 0 ? 0 : Math.min(BUCKETS - 1, Math.floor(((at - firstAt) / span) * BUCKETS));

// updated_at is not a record of the author revising a note — indexing and
// re-embedding both touch it, and 1,264 of 1,357 notes carry a later
// updated_at than created_at. A "revised" marker built on it would fire on
// almost everything, so corrections here mean an explicit amendment.
const corrections = (client: MemexClient, ids: number[]): Omit<Marker, 'bucket'>[] => {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  return (
    client.sqlite
      .prepare(
        `SELECT n.id AS noteId, n.title, COALESCE(n.authored_at, n.created_at) AS at,
                t.title AS correctedTitle
         FROM note_links l
         JOIN notes n ON n.id = l.source_id
         JOIN notes t ON t.id = l.target_id
         WHERE l.source = 'amends' AND l.target_id IN (${placeholders})
         ORDER BY at`,
      )
      .all(...ids) as { noteId: number; title: string; at: number; correctedTitle: string }[]
  ).map((r) => ({
    kind: 'correction' as const,
    at: r.at,
    noteId: r.noteId,
    title: r.title,
    detail: `corrects "${r.correctedTitle}"`,
  }));
};

const returns = (notes: TopicNote[]): Omit<Marker, 'bucket'>[] =>
  notes.reduce<Omit<Marker, 'bucket'>[]>((acc, note, i) => {
    if (i === 0) return acc;
    const gap = note.at - notes[i - 1].at;
    if (gap < GAP_DAYS * DAY) return acc;
    return [
      ...acc,
      {
        kind: 'return',
        at: note.at,
        noteId: note.id,
        title: note.title,
        detail: `picked up after ${Math.round(gap / DAY)} quiet days`,
      },
    ];
  }, []);

const arcs = (client: MemexClient, ids: number[]): Omit<Marker, 'bucket'>[] => {
  const within = new Set(ids);
  return listSignals(client, { type: 'hidden_arc' })
    .filter((s) => s.evidenceIds.some((id) => within.has(id)))
    .map((s) => {
      const seed = s.evidenceIds.find((id) => within.has(id)) as number;
      const row = client.sqlite
        .prepare('SELECT title, COALESCE(authored_at, created_at) AS at FROM notes WHERE id = ?')
        .get(seed) as { title: string; at: number } | undefined;
      return {
        kind: 'arc' as const,
        at: row?.at ?? s.createdAt,
        noteId: seed,
        title: row?.title ?? '',
        detail: s.reasoning ?? 'an un-synthesized thread',
      };
    });
};

export const buildTopic = (client: MemexClient, tag: string, now = Date.now()): Topic | null => {
  const notes = notesForTag(client, tag);
  if (notes.length === 0) return null;

  const firstAt = notes[0].at;
  const lastAt = notes[notes.length - 1].at;
  const span = lastAt - firstAt;

  const buckets = notes.reduce<number[]>(
    (acc, note) => {
      const i = bucketOf(note.at, firstAt, span);
      acc[i] += 1;
      return acc;
    },
    Array.from({ length: BUCKETS }, () => 0),
  );

  const ids = notes.map((n) => n.id);
  const markers = [...corrections(client, ids), ...returns(notes), ...arcs(client, ids)]
    .map((m) => ({ ...m, bucket: bucketOf(m.at, firstAt, span) }))
    .sort((a, b) => a.at - b.at);

  return {
    tag,
    count: notes.length,
    firstAt,
    lastAt,
    dormant: now - lastAt > DORMANT_DAYS * DAY,
    buckets,
    markers,
  };
};

export const listTopicTags = (client: MemexClient): string[] =>
  (
    client.sqlite
      .prepare(
        `SELECT j.value AS tag, COUNT(*) AS c
         FROM notes n, json_each(n.tags) j
         GROUP BY j.value HAVING c >= ?
         ORDER BY c DESC`,
      )
      .all(MIN_USES) as { tag: string }[]
  ).map((r) => r.tag);

export const buildTopics = (client: MemexClient, now = Date.now()): Topic[] =>
  listTopicTags(client)
    .map((tag) => buildTopic(client, tag, now))
    .filter((t): t is Topic => t !== null)
    .sort((a, b) => b.lastAt - a.lastAt);

export const topicNotes = (client: MemexClient, tag: string) => notesForTag(client, tag);
