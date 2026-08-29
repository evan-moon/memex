import type { MemexClient } from './client.ts';

export type PresentationSurface = 'mcp' | 'cli' | 'ui';

export type SignalPresentation = {
  id: number;
  signalId: number;
  surface: PresentationSurface;
  at: number;
};

export type SignalReception = {
  signalId: number;
  shown: number;
  lastAt: number;
};

export const recordPresentation = (
  client: MemexClient,
  signalId: number,
  surface: PresentationSurface,
  at = Date.now(),
) => {
  client.sqlite
    .prepare('INSERT INTO signal_presentations (signal_id, surface, at) VALUES (?, ?, ?)')
    .run(signalId, surface, at);
};

export const presentationsFor = (client: MemexClient, signalId: number): SignalPresentation[] =>
  client.sqlite
    .prepare(
      `SELECT id, signal_id AS signalId, surface, at
       FROM signal_presentations WHERE signal_id = ? ORDER BY at`,
    )
    .all(signalId) as SignalPresentation[];

export const receptionCounts = (client: MemexClient): Map<number, SignalReception> =>
  (
    client.sqlite
      .prepare(
        `SELECT signal_id AS signalId, COUNT(*) AS shown, MAX(at) AS lastAt
         FROM signal_presentations GROUP BY signal_id`,
      )
      .all() as SignalReception[]
  ).reduce((acc, row) => acc.set(row.signalId, row), new Map<number, SignalReception>());

// A signal still `new` after being shown was declined by silence; one never shown
// is only waiting. Reading the first as the second is what makes a queue look
// rejected when nobody was ever asked.
export const wasIgnored = (client: MemexClient, signalId: number, status: string) =>
  status === 'new' && presentationsFor(client, signalId).length > 0;
