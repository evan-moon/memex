import { homedir } from 'node:os';
import { join } from 'node:path';
import { type MemexClient, openDb } from '@memex/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDeck } from './deck.ts';

let client: MemexClient;

describe.skipIf(process.env.MEMEX_REAL_VAULT !== '1')('the real deck', () => {
  beforeAll(() => {
    client = openDb(join(homedir(), '.memex'));
  });
  afterAll(() => {
    client.sqlite.close();
  });

  it('shows what a session now holds', () => {
    const deck = buildDeck(client);
    console.log(`session: ${String(deck.cards.length)} / ${String(deck.session)}`);
    for (const card of deck.cards) {
      console.log(
        `\n[${card.kind}] ${card.heading ?? '(섹션 없음)'}\n  ${card.text.slice(0, 78)}\n  ${
          card.source?.title.slice(0, 54) ?? '-'
        } · 주입 ${String(card.injected.hits)}회`,
      );
    }
    expect(deck.cards.length).toBeLessThanOrEqual(deck.session);
  });
});
