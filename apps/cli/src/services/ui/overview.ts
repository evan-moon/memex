import { countChunks, countNotes, type MemexClient } from '@memex/db';
import { buildTopics } from './topics.ts';

const DAY = 86_400_000;

export type Overview = {
  notes: number;
  chunks: number;
  links: { wiki: number; amends: number };
  topics: number;
  changed: number;
  review: number;
  activity: { date: string; notes: number }[];
  staleness: {
    tag: string;
    count: number;
    outdated: number;
    share: number;
    spark: number[];
    lastAt: number;
    dormant: boolean;
  }[];
};

// Only what a person wrote counts as use — `index` is a bulk import of files
// that already existed, and charting it would show a wall on the day the vault
// was first scanned rather than a habit.
const WRITTEN = "('claude-code', 'manual', 'git')";

const activity = (client: MemexClient, days: number, now: number) => {
  const since = now - days * DAY;
  const rows = client.sqlite
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS date, COUNT(*) AS notes
       FROM notes WHERE source IN ${WRITTEN} AND created_at >= ?
       GROUP BY date`,
    )
    .all(since) as { date: string; notes: number }[];

  const byDate = new Map(rows.map((r) => [r.date, r.notes]));
  return Array.from({ length: days }, (_, i) => {
    const at = new Date(since + i * DAY);
    const date = new Date(at.getTime() - at.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
    return { date, notes: byDate.get(date) ?? 0 };
  });
};

export const buildOverview = (client: MemexClient, now = Date.now()): Overview => {
  const links = client.sqlite
    .prepare('SELECT source, COUNT(*) AS c FROM note_links GROUP BY source')
    .all() as { source: string; c: number }[];
  const topics = buildTopics(client, now);

  return {
    notes: countNotes(client),
    chunks: countChunks(client),
    links: {
      wiki: links.find((l) => l.source === 'wiki')?.c ?? 0,
      amends: links
        .filter((l) => l.source === 'amends' || l.source === 'corrects' || l.source === 'continues')
        .reduce((n, l) => n + l.c, 0),
    },
    topics: topics.length,
    changed: topics.reduce((acc, t) => acc + t.changedCount, 0),
    review: topics.reduce((acc, t) => acc + t.reviewCount, 0),
    activity: activity(client, 90, now),
    // A topic nobody has touched in a season is not rotting, it is finished.
    // Sorting by share alone put those at the top and buried the subjects that
    // are still moving while going out of date underneath them.
    staleness: topics
      .map((t) => ({
        tag: t.tag,
        count: t.count,
        outdated: t.changedCount + t.reviewCount,
        share:
          t.currentCount + t.changedCount + t.reviewCount === 0
            ? 0
            : (t.changedCount + t.reviewCount) / (t.currentCount + t.changedCount + t.reviewCount),
        spark: t.spark,
        lastAt: t.lastAt,
        dormant: t.dormant,
      }))
      .sort(
        (a, b) =>
          Number(a.dormant) - Number(b.dormant) || b.outdated - a.outdated || b.share - a.share,
      )
      .slice(0, 12),
  };
};
