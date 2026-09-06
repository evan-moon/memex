import type { MemexClient } from './client.ts';

// `correct-wanted` is not a correction. It records that the person read the card
// and knew it was wrong, without asking them for the value they may not have.
// Counting these is what tells us whether judging claims finds real errors at all.
export type JudgementAction = 'confirm' | 'defer' | 'correct-wanted' | 'not-a-fact';

export type Judgement = {
  id: number;
  itemKey: string;
  action: JudgementAction;
  previous: unknown;
  at: number;
};

type Row = { id: number; item_key: string; action: JudgementAction; previous: string; at: number };

const toJudgement = (row: Row): Judgement => ({
  id: row.id,
  itemKey: row.item_key,
  action: row.action,
  previous: JSON.parse(row.previous) as unknown,
  at: row.at,
});

export const recordJudgement = (
  client: MemexClient,
  entry: { itemKey: string; action: JudgementAction; previous: unknown },
  at = Date.now(),
): Judgement => {
  const { lastInsertRowid } = client.sqlite
    .prepare('INSERT INTO claim_actions (item_key, action, previous, at) VALUES (?, ?, ?, ?)')
    .run(entry.itemKey, entry.action, JSON.stringify(entry.previous), at);
  return { id: Number(lastInsertRowid), ...entry, at };
};

export const lastJudgement = (client: MemexClient): Judgement | null => {
  const row = client.sqlite.prepare('SELECT * FROM claim_actions ORDER BY id DESC LIMIT 1').get() as
    | Row
    | undefined;
  return row ? toJudgement(row) : null;
};

export const dropJudgement = (client: MemexClient, id: number) => {
  client.sqlite.prepare('DELETE FROM claim_actions WHERE id = ?').run(id);
};

// Volume is not rewarded, but it is priced. Past the third session in a day a
// confirmation stops buying the long freshness, because by then the reading is
// not what it was on the first card.
export const BINGE_LIMIT = 21;

export const correctionsWanted = (client: MemexClient): number =>
  (
    client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM claim_actions WHERE action = 'correct-wanted'")
      .get() as { n: number }
  ).n;

export const judgementsSince = (client: MemexClient, since: number): number =>
  (
    client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM claim_actions WHERE action = 'confirm' AND at >= ?")
      .get(since) as { n: number }
  ).n;

export const startOfDay = (at = Date.now()): number => {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};
