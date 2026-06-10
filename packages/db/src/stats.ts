import type { MemexClient } from './client.ts';

// Deterministic corpus measurements (LLM 0). The flashback numbers exist to
// answer the success metrics set when flashback shipped: is cross-pollination
// actually being picked up, or just shown? "Adopted" means a flashback pair
// later gained a wiki link — the connection was cited in real writing, which
// is the observable trace of a Contextual Jump.

export type CountByKey = { key: string; count: number };

export type ResurfacedNote = { id: number; title: string; count: number };

export type FlashbackStats = {
  total: number;
  adopted: number;
  adoptionRate: number | null; // null when there are no flashback links yet
  topResurfaced: ResurfacedNote[];
};

export type CorpusStats = {
  notes: number;
  notesByLayer: CountByKey[];
  notesBySource: CountByKey[];
  linksBySource: CountByKey[];
  flashback: FlashbackStats;
  signalsByStatus: CountByKey[];
  inferencesByStatus: CountByKey[];
};

const countBy = (client: MemexClient, sql: string): CountByKey[] =>
  client.sqlite.prepare(sql).all() as CountByKey[];

export const getFlashbackStats = (client: MemexClient, topLimit = 5): FlashbackStats => {
  const row = client.sqlite
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(EXISTS(
                SELECT 1 FROM note_links w
                WHERE w.source = 'wiki'
                  AND ((w.source_id = f.source_id AND w.target_id = f.target_id)
                    OR (w.source_id = f.target_id AND w.target_id = f.source_id))
              )), 0) AS adopted
       FROM note_links f
       WHERE f.source = 'flashback'`,
    )
    .get() as { total: number; adopted: number };

  const topResurfaced = client.sqlite
    .prepare(
      `SELECT n.id, n.title, COUNT(*) AS count
       FROM note_links f
       JOIN notes n ON n.id = f.target_id
       WHERE f.source = 'flashback'
       GROUP BY f.target_id
       ORDER BY count DESC, n.id ASC
       LIMIT ?`,
    )
    .all(topLimit) as ResurfacedNote[];

  return {
    total: row.total,
    adopted: row.adopted,
    adoptionRate: row.total > 0 ? row.adopted / row.total : null,
    topResurfaced,
  };
};

export const getCorpusStats = (client: MemexClient): CorpusStats => ({
  notes: (client.sqlite.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n,
  notesByLayer: countBy(
    client,
    'SELECT layer AS key, COUNT(*) AS count FROM notes GROUP BY layer ORDER BY count DESC',
  ),
  notesBySource: countBy(
    client,
    'SELECT source AS key, COUNT(*) AS count FROM notes GROUP BY source ORDER BY count DESC',
  ),
  linksBySource: countBy(
    client,
    'SELECT source AS key, COUNT(*) AS count FROM note_links GROUP BY source ORDER BY count DESC',
  ),
  flashback: getFlashbackStats(client),
  signalsByStatus: countBy(
    client,
    'SELECT status AS key, COUNT(*) AS count FROM signals GROUP BY status ORDER BY count DESC',
  ),
  inferencesByStatus: countBy(
    client,
    'SELECT status AS key, COUNT(*) AS count FROM inferences GROUP BY status ORDER BY count DESC',
  ),
});
