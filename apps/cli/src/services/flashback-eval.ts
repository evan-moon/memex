import { findFlashbacks, type MemexClient } from '@memex/db';

const DAY = 86_400_000;

export type LinkedPair = {
  source: number;
  target: number;
  daysApart: number;
  crossFolder: boolean;
};

export type PoolRow = { pool: number; found: number; total: number };

export type CapRow = {
  cap: number;
  hits: number;
  total: number;
  withCandidate: number;
  sampled: number;
  medianCandidates: number;
};

export type FlashbackEval = {
  links: { total: number; backward: number; shaped: number };
  minDaysGap: number;
  pools: PoolRow[];
  caps: CapRow[];
};

// The vault's own labels. A wiki link is the user reaching for one note while
// writing another, which is the judgement flashback is trying to anticipate.
export const linkedPairs = (client: MemexClient): LinkedPair[] =>
  (
    client.sqlite
      .prepare(
        `SELECT l.source_id AS source, l.target_id AS target,
                COALESCE(ns.authored_at, ns.created_at) AS sourceAt,
                COALESCE(nt.authored_at, nt.created_at) AS targetAt,
                ns.category AS sourceCategory, nt.category AS targetCategory
         FROM note_links l
         JOIN notes ns ON ns.id = l.source_id
         JOIN notes nt ON nt.id = l.target_id
         WHERE l.source = 'wiki'`,
      )
      .all() as {
      source: number;
      target: number;
      sourceAt: number;
      targetAt: number;
      sourceCategory: string | null;
      targetCategory: string | null;
    }[]
  ).map((r) => ({
    source: r.source,
    target: r.target,
    daysApart: Math.floor((r.sourceAt - r.targetAt) / DAY),
    crossFolder:
      r.sourceCategory === null ||
      r.targetCategory === null ||
      r.sourceCategory !== r.targetCategory,
  }));

const embeddingOf = (client: MemexClient, noteId: number) =>
  (
    client.sqlite
      .prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?')
      .get(BigInt(noteId)) as { embedding: Buffer } | undefined
  )?.embedding;

// Deliberately unfiltered: this asks whether the vector neighbourhood contains
// the note at all, which is the question `k` decides. Every filter after it can
// only take candidates away.
const neighbourhood = (client: MemexClient, noteId: number, k: number): number[] => {
  const embedding = embeddingOf(client, noteId);
  if (!embedding) return [];
  return (
    client.sqlite
      .prepare(
        `SELECT n.id FROM note_embeddings e JOIN notes n ON n.id = e.note_id
         WHERE e.embedding MATCH ? AND k = ? AND n.id != ?
         ORDER BY e.distance`,
      )
      .all(embedding, k, noteId) as { id: number }[]
  ).map((r) => r.id);
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export const evaluateFlashback = (
  client: MemexClient,
  {
    minDaysGap,
    pools,
    caps,
    sample,
    now = Date.now(),
  }: {
    minDaysGap: number;
    pools: number[];
    caps: number[];
    sample: number;
    now?: number;
  },
): FlashbackEval => {
  const pairs = linkedPairs(client);
  const backward = pairs.filter((p) => p.daysApart > 0);
  const shaped = backward.filter((p) => p.daysApart >= minDaysGap && p.crossFolder);

  const poolRows = pools.map((pool) => ({
    pool,
    found: backward.filter((p) => neighbourhood(client, p.source, pool).includes(p.target)).length,
    total: backward.length,
  }));

  const sampled = (
    client.sqlite.prepare('SELECT id FROM notes ORDER BY created_at DESC LIMIT ?').all(sample) as {
      id: number;
    }[]
  ).map((r) => r.id);

  const widest = Math.max(...pools);
  const capRows = caps.map((cap) => {
    const hits = shaped.filter((p) =>
      findFlashbacks(client, p.source, now, { limit: 3, pool: widest, maxDistance: cap }).some(
        (f) => f.id === p.target,
      ),
    );
    const counts = sampled.map(
      (id) =>
        findFlashbacks(client, id, now, { limit: widest, pool: widest, maxDistance: cap }).length,
    );
    return {
      cap,
      hits: hits.length,
      total: shaped.length,
      withCandidate: counts.filter((c) => c > 0).length,
      sampled: counts.length,
      medianCandidates: median(counts),
    };
  });

  return {
    links: { total: pairs.length, backward: backward.length, shaped: shaped.length },
    minDaysGap,
    pools: poolRows,
    caps: capRows,
  };
};
