import { listSignals, type MemexClient } from '@memex/db';

const MIN_USES = 20;
const DORMANT_DAYS = 90;
const PREVIEW = 6;
const SPARK_WEEKS = 52;
const WEEK = 7 * 86_400_000;
const DAY = 86_400_000;

export type TopicNoteRef = {
  id: number;
  title: string;
  layer: string;
  at: number;
  reason: string | null;
};

export type Arc = { reasoning: string; noteIds: number[] };

export type Topic = {
  tag: string;
  count: number;
  /** Weekly note counts over a window shared by every topic. */
  spark: number[];
  lastAt: number;
  dormant: boolean;
  currentCount: number;
  outdatedCount: number;
  current: TopicNoteRef[];
  outdated: TopicNoteRef[];
  arcs: Arc[];
};

type Row = { id: number; title: string; layer: string; at: number };

const notesForTag = (client: MemexClient, tag: string): Row[] =>
  client.sqlite
    .prepare(
      `SELECT n.id, n.title, n.layer, COALESCE(n.authored_at, n.created_at) AS at
       FROM notes n, json_each(n.tags) j
       WHERE j.value = ?
       ORDER BY at DESC`,
    )
    .all(tag) as Row[];

// A note is out of date for one of two reasons the vault already records: a
// later note corrected it, or it claims to be a current plan while newer
// records piled up behind it.
const supersededBy = (client: MemexClient, ids: number[]): Map<number, string> => {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = client.sqlite
    .prepare(
      `SELECT l.target_id AS id, n.id AS fixId, n.title AS fixTitle,
              COALESCE(n.authored_at, n.created_at) AS at
       FROM note_links l JOIN notes n ON n.id = l.source_id
       WHERE l.source = 'amends' AND l.target_id IN (${placeholders})
       ORDER BY at`,
    )
    .all(...ids) as { id: number; fixId: number; fixTitle: string }[];
  return rows.reduce(
    (acc, r) => acc.set(r.id, `#${r.fixId} "${r.fixTitle}" 에서 정정됨`),
    new Map<number, string>(),
  );
};

const staleReasons = (client: MemexClient): Map<number, string> =>
  listSignals(client, { type: 'stale_state', status: 'new' }).reduce((acc, s) => {
    const [stateNote, ...newer] = s.evidenceIds;
    return stateNote === undefined
      ? acc
      : acc.set(stateNote, `이후 기록 ${newer.length}개가 쌓임 — 아직 맞는지 확인 필요`);
  }, new Map<number, string>());

const arcsFor = (client: MemexClient, ids: Set<number>): Arc[] =>
  listSignals(client, { type: 'hidden_arc', status: 'new' })
    .filter((s) => s.evidenceIds.filter((id) => ids.has(id)).length >= 2)
    .map((s) => ({ reasoning: s.reasoning ?? '아직 엮이지 않은 흐름', noteIds: s.evidenceIds }));

// Every topic is bucketed over the same absolute window, the way a repository
// list does it: the same x position is the same week on every row, so a flat
// right edge reads as gone quiet and rows can be compared at a glance. Giving
// each topic its own range — as an earlier version did — made position mean
// nothing.
const sparkline = (notes: Row[], now: number): number[] => {
  const start = now - SPARK_WEEKS * WEEK;
  return notes.reduce<number[]>(
    (acc, note) => {
      if (note.at < start) return acc;
      const i = Math.min(SPARK_WEEKS - 1, Math.floor((note.at - start) / WEEK));
      acc[i] += 1;
      return acc;
    },
    Array.from({ length: SPARK_WEEKS }, () => 0),
  );
};

export const buildTopic = (client: MemexClient, tag: string, now = Date.now()): Topic | null => {
  const notes = notesForTag(client, tag);
  if (notes.length === 0) return null;

  const ids = notes.map((n) => n.id);
  const fixed = supersededBy(client, ids);
  const stale = staleReasons(client);

  const reasonFor = (n: Row) => fixed.get(n.id) ?? stale.get(n.id) ?? null;
  const outdated = notes
    .filter((n) => reasonFor(n) !== null)
    .map((n) => ({ ...n, reason: reasonFor(n) }));

  const outdatedIds = new Set(outdated.map((n) => n.id));
  const believed = notes.filter((n) => n.layer === 'state' && !outdatedIds.has(n.id));

  // A topic made only of records has no standing claim to show — the honest
  // answer there is its latest entries, not an empty column.
  const current =
    believed.length > 0
      ? believed.map((n) => ({ ...n, reason: null }))
      : notes.filter((n) => !outdatedIds.has(n.id)).map((n) => ({ ...n, reason: '최근 기록' }));

  return {
    tag,
    count: notes.length,
    spark: sparkline(notes, now),
    lastAt: notes[0].at,
    dormant: now - notes[0].at > DORMANT_DAYS * DAY,
    currentCount: current.length,
    outdatedCount: outdated.length,
    current: current.slice(0, PREVIEW),
    outdated: outdated.slice(0, PREVIEW),
    arcs: arcsFor(client, new Set(ids)),
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
    .sort((a, b) => b.outdatedCount - a.outdatedCount || b.lastAt - a.lastAt);

export const topicNotes = (client: MemexClient, tag: string) => notesForTag(client, tag);
