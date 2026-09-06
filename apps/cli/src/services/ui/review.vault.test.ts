import { homedir } from 'node:os';
import { join } from 'node:path';
import { deferReviewItem, listDeferrals, type MemexClient, openDb } from '@memex/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildReview, reviewItemState } from './review.ts';

let client: MemexClient;

describe.skipIf(process.env.MEMEX_REAL_VAULT !== '1')('the real vault', () => {
  beforeAll(() => {
    client = openDb(join(homedir(), '.memex'));
  });

  afterAll(() => {
    client.sqlite.close();
  });

  it('reports what a session would hold', () => {
    const { items } = buildReview(client);
    console.log('session:', items.length);
    for (const item of items) {
      console.log(
        [
          item.key,
          item.kind,
          item.grade,
          item.recurring ? 'recurring' : '-',
          `injected=${String(item.injected.hits)}`,
          `approve=${String(item.canApprove)}`,
          item.target.title.slice(0, 40),
        ].join('  '),
      );
    }
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it.skipIf(process.env.MEMEX_DEFER_ALL !== '1')('defers everything it can see', () => {
    const seen = new Set<string>();
    for (let round = 0; round < 40; round += 1) {
      const { items } = buildReview(client);
      const next = items.find((item) => !seen.has(item.key));
      if (!next) break;
      seen.add(next.key);
      const state = reviewItemState(client, next.key);
      if (state) deferReviewItem(client, state);
    }
    console.log('deferred:', listDeferrals(client).length);
    expect(buildReview(client).items).toEqual([]);
  });

  it.skipIf(process.env.MEMEX_CLEAR_DEFERRALS !== '1')('clears every deferral again', () => {
    client.sqlite.prepare('DELETE FROM review_deferrals').run();
    expect(listDeferrals(client)).toEqual([]);
    console.log('session after clearing:', buildReview(client).items.length);
  });
});
