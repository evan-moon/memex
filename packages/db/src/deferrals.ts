import type { MemexClient } from './client.ts';

export type Deferral = {
  itemKey: string;
  noteId: number;
  fingerprint: string;
  hits: number;
  at: number;
  wokenAt: number | null;
};

export type DeferralInput = Omit<Deferral, 'at' | 'wokenAt'>;

export type ReviewState = { itemKey: string; fingerprint: string; hits: number };

type Row = {
  item_key: string;
  note_id: number;
  fingerprint: string;
  hits: number;
  at: number;
  woken_at: number | null;
};

const toDeferral = (row: Row): Deferral => ({
  itemKey: row.item_key,
  noteId: row.note_id,
  fingerprint: row.fingerprint,
  hits: row.hits,
  at: row.at,
  wokenAt: row.woken_at,
});

export const deferReviewItem = (
  client: MemexClient,
  input: DeferralInput,
  at = Date.now(),
): Deferral => {
  client.sqlite
    .prepare(
      `INSERT OR REPLACE INTO review_deferrals (item_key, note_id, fingerprint, hits, at, woken_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .run(input.itemKey, input.noteId, input.fingerprint, input.hits, at);
  return { ...input, at, wokenAt: null };
};

export const listDeferrals = (client: MemexClient): Deferral[] =>
  (
    client.sqlite.prepare('SELECT * FROM review_deferrals ORDER BY at DESC').all() as Row[]
  ).map(toDeferral);

export const clearDeferral = (client: MemexClient, itemKey: string) => {
  client.sqlite.prepare('DELETE FROM review_deferrals WHERE item_key = ?').run(itemKey);
};

const staysAsleep = (deferral: Deferral, state: ReviewState | undefined) =>
  deferral.wokenAt === null &&
  state !== undefined &&
  deferral.fingerprint === state.fingerprint &&
  state.hits <= deferral.hits;

export type Waking = { asleep: Set<string>; met: Set<string> };

export const wakeDeferrals = (client: MemexClient, states: ReviewState[]): Waking => {
  const byKey = new Map(states.map((state) => [state.itemKey, state]));
  const held = listDeferrals(client);
  const asleep = new Set(
    held.filter((deferral) => staysAsleep(deferral, byKey.get(deferral.itemKey)))
      .map((deferral) => deferral.itemKey),
  );

  const waking = held.filter(
    (deferral) =>
      deferral.wokenAt === null &&
      !asleep.has(deferral.itemKey) &&
      byKey.has(deferral.itemKey),
  );
  const now = Date.now();
  const mark = client.sqlite.prepare(
    'UPDATE review_deferrals SET woken_at = ? WHERE item_key = ?',
  );
  for (const deferral of waking) mark.run(now, deferral.itemKey);

  const gone = held.filter((deferral) => !byKey.has(deferral.itemKey));
  for (const deferral of gone) clearDeferral(client, deferral.itemKey);

  return {
    asleep,
    met: new Set(held.filter((d) => !asleep.has(d.itemKey) && byKey.has(d.itemKey)).map((d) => d.itemKey)),
  };
};
