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

// Gate 4 of the type-classification work order asks one question: did moving
// the rules from an ad-hoc SQL pass into code lose evidence? An absolute
// percentage could not answer it — the first reading was 33%, and 37 book
// manuscripts leaving the index dropped it to 32.97% without a rule changing.
// So the reading is a comparison, over the notes both passes saw.
export type LabelEvidence = {
  labelled: number;
  strong: number;
  declared: number;
  againstBaseline: {
    shared: number;
    thenStrong: number;
    nowStrong: number;
  } | null;
};

export type CorpusStats = {
  notes: number;
  chunks: number;
  notesWithoutChunks: number;
  notesByLayer: CountByKey[];
  notesBySource: CountByKey[];
  linksBySource: CountByKey[];
  flashback: FlashbackStats;
  signalsByStatus: CountByKey[];
  inferencesByStatus: CountByKey[];
  labels: LabelEvidence;
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

export const getLabelEvidence = (client: MemexClient): LabelEvidence => {
  const totals = client.sqlite
    .prepare(
      `SELECT COUNT(*) AS labelled,
              COALESCE(SUM(confidence = '강'), 0) AS strong,
              COALESCE(SUM(method = 'declared'), 0) AS declared
       FROM note_type_labels`,
    )
    .get() as { labelled: number; strong: number; declared: number };

  const compared = client.sqlite
    .prepare(
      `SELECT COUNT(*) AS shared,
              COALESCE(SUM(b.confidence = '강'), 0) AS thenStrong,
              COALESCE(SUM(l.confidence = '강'), 0) AS nowStrong
       FROM note_type_baseline b
       JOIN note_type_labels l ON l.note_id = b.note_id
       JOIN notes n ON n.id = b.note_id`,
    )
    .get() as { shared: number; thenStrong: number; nowStrong: number };

  return {
    ...totals,
    againstBaseline: compared.shared === 0 ? null : compared,
  };
};

export const getCorpusStats = (client: MemexClient): CorpusStats => ({
  notes: (client.sqlite.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n,
  chunks: (client.sqlite.prepare('SELECT COUNT(*) AS n FROM note_chunks').get() as { n: number }).n,
  notesWithoutChunks: (
    client.sqlite
      .prepare(
        'SELECT COUNT(*) AS n FROM notes n WHERE NOT EXISTS (SELECT 1 FROM note_chunks c WHERE c.note_id = n.id)',
      )
      .get() as { n: number }
  ).n,
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
  labels: getLabelEvidence(client),
});
