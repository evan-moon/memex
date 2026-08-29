import { inferencesOverNotes, listSignals, type MemexClient } from '@memex/db';
import { amendedStatuses, type NoteStatus, piledUpStatuses } from './status.ts';

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
  status: NoteStatus | null;
};

export type Arc = { reasoning: string | null; noteIds: number[] };

export type Companion = {
  tag: string;
  shared: number;
  /** Share of the smaller topic the two have in common. */
  overlap: number;
  /** Near-total overlap both ways — likely the same subject spelled twice. */
  sameThing: boolean;
};

export type Topic = {
  tag: string;
  count: number;
  /** Weekly note counts over a window shared by every topic. */
  spark: number[];
  lastAt: number;
  dormant: boolean;
  currentCount: number;
  changedCount: number;
  reviewCount: number;
  current: TopicNoteRef[];
  outdated: TopicNoteRef[];
  companions: Companion[];
  arcs: Arc[];
  hypotheses: { id: number; title: string; status: string; shared: number }[];
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

const arcsFor = (client: MemexClient, ids: Set<number>): Arc[] =>
  listSignals(client, { type: 'hidden_arc', status: 'new' })
    .filter((s) => s.evidenceIds.filter((id) => ids.has(id)).length >= 2)
    .map((s) => ({ reasoning: s.reasoning, noteIds: s.evidenceIds }));

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

// Which subjects this one keeps company with. Two spellings of the same thing
// (toss / 토스) score the same as a real relationship (1on1 / 커피챗), and no
// count can tell them apart — so near-total overlap in both directions is
// flagged rather than hidden, and the reader decides.
const companionsFor = (client: MemexClient, tag: string): Companion[] => {
  const rows = client.sqlite
    .prepare(
      `WITH mine AS (
         SELECT n.id FROM notes n, json_each(n.tags) j WHERE j.value = ?
       )
       SELECT j.value AS tag, COUNT(*) AS shared,
              (SELECT COUNT(*) FROM notes n2, json_each(n2.tags) j2 WHERE j2.value = j.value) AS total
       FROM mine JOIN notes n ON n.id = mine.id, json_each(n.tags) j
       WHERE j.value != ?
       GROUP BY j.value
       HAVING shared >= 5
       ORDER BY shared DESC
       LIMIT 8`,
    )
    .all(tag, tag) as { tag: string; shared: number; total: number }[];

  const mine = client.sqlite
    .prepare('SELECT COUNT(*) AS c FROM notes n, json_each(n.tags) j WHERE j.value = ?')
    .get(tag) as { c: number };

  return rows.map((r) => ({
    tag: r.tag,
    shared: r.shared,
    overlap: r.shared / Math.min(mine.c, r.total),
    sameThing: r.shared / mine.c >= 0.95 && r.shared / r.total >= 0.95,
  }));
};

export const buildTopic = (client: MemexClient, tag: string, now = Date.now()): Topic | null => {
  const notes = notesForTag(client, tag);
  if (notes.length === 0) return null;

  const ids = notes.map((n) => n.id);
  const fixed = amendedStatuses(client, ids);
  const stale = piledUpStatuses(client);

  const statusFor = (n: Row) => fixed.get(n.id) ?? stale.get(n.id) ?? null;
  const outdated = notes
    .filter((n) => statusFor(n) !== null)
    .map((n) => ({ ...n, status: statusFor(n), changed: fixed.has(n.id) }));

  const outdatedIds = new Set(outdated.map((n) => n.id));
  const believed = notes.filter((n) => n.layer === 'state' && !outdatedIds.has(n.id));

  // A topic made only of records has no standing claim to show — the honest
  // answer there is its latest entries, not an empty column.
  const current =
    believed.length > 0
      ? believed.map((n) => ({ ...n, status: null }))
      : notes
          .filter((n) => !outdatedIds.has(n.id))
          .map((n) => ({ ...n, status: { kind: 'recent' as const } }));

  return {
    tag,
    count: notes.length,
    spark: sparkline(notes, now),
    lastAt: notes[0].at,
    dormant: now - notes[0].at > DORMANT_DAYS * DAY,
    currentCount: current.length,
    changedCount: outdated.filter((n) => n.changed).length,
    reviewCount: outdated.filter((n) => !n.changed).length,
    current: current.slice(0, PREVIEW),
    outdated: outdated.slice(0, PREVIEW),
    companions: companionsFor(client, tag),
    arcs: arcsFor(client, new Set(ids)),
    hypotheses: inferencesOverNotes(client, ids),
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
    .sort(
      (a, b) =>
        b.changedCount + b.reviewCount - (a.changedCount + a.reviewCount) || b.lastAt - a.lastAt,
    );

export const topicNotes = (client: MemexClient, tag: string) => notesForTag(client, tag);
