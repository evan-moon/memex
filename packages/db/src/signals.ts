import { createHash } from 'node:crypto';
import type { MemexClient } from './client.ts';
import { parseTags } from './repository.ts';

// Lv1 deterministic inference signals.
//
// A signal points at an un-synthesized pattern in the corpus ("there is
// something here worth thinking about"). Signals are NOT inferences — they are
// cheap, deterministic, and carry no LLM-generated claims. The LLM only enters
// at the Lv2 minting step (see inferences). Keeping detection deterministic is
// a core design principle: it is fast, reproducible, and cannot self-poison.
//
// Distance note: embeddings are L2-normalized unit vectors, and the vec0 table
// uses the default L2 metric, so `distance` is Euclidean. For unit vectors
// L2 = sqrt(2 - 2·cos), e.g. L2 0.40 ≈ cos 0.92, L2 0.55 ≈ cos 0.85.

export type SignalType = 'hidden_arc' | 'dangling_link' | 'stale_state' | 'tag_burst';
export type SignalStatus = 'new' | 'snoozed' | 'dismissed' | 'minted';

export type Signal = {
  id: number;
  type: SignalType;
  evidenceIds: number[];
  reasoning: string | null;
  signalHash: string;
  status: SignalStatus;
  createdAt: number;
  updatedAt: number;
};

export type SignalCandidate = {
  type: SignalType;
  evidenceIds: number[];
  reasoning: string;
  // Stable identity for dedup. When omitted, identity is the sorted evidence
  // ids. Use an explicit identity when the signal's "sameness" is not fully
  // captured by its evidence set (e.g. a dangling link is identified by its
  // source note + the missing title, not just the source note).
  identity?: string;
};

type SignalRow = {
  id: number;
  type: SignalType;
  evidence_ids: string;
  reasoning: string | null;
  signal_hash: string;
  status: SignalStatus;
  created_at: number;
  updated_at: number;
};

const rowToSignal = (r: SignalRow): Signal => ({
  id: r.id,
  type: r.type,
  evidenceIds: JSON.parse(r.evidence_ids) as number[],
  reasoning: r.reasoning,
  signalHash: r.signal_hash,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const computeSignalHash = (candidate: SignalCandidate): string => {
  const identity = candidate.identity ?? [...candidate.evidenceIds].sort((a, b) => a - b).join(',');
  return createHash('sha256').update(`${candidate.type}|${identity}`).digest('hex');
};

// Idempotent insert. Re-running detection never duplicates a signal and never
// resurrects one the user already triaged (dismissed/snoozed/minted) — the
// unique signal_hash + INSERT OR IGNORE preserves the existing row and its
// status. Returns the persisted signal (existing or new).
export const upsertSignal = (client: MemexClient, candidate: SignalCandidate): Signal => {
  const hash = computeSignalHash(candidate);
  const now = Date.now();
  client.sqlite
    .prepare(
      `INSERT OR IGNORE INTO signals
         (type, evidence_ids, reasoning, signal_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'new', ?, ?)`,
    )
    .run(
      candidate.type,
      JSON.stringify(candidate.evidenceIds),
      candidate.reasoning,
      hash,
      now,
      now,
    );
  const row = client.sqlite
    .prepare('SELECT * FROM signals WHERE signal_hash = ?')
    .get(hash) as SignalRow;
  return rowToSignal(row);
};

export type ListSignalsOptions = { status?: SignalStatus; type?: SignalType };

export const listSignals = (client: MemexClient, options: ListSignalsOptions = {}): Signal[] => {
  const where: string[] = [];
  const args: string[] = [];
  if (options.status) {
    where.push('status = ?');
    args.push(options.status);
  }
  if (options.type) {
    where.push('type = ?');
    args.push(options.type);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = client.sqlite
    .prepare(`SELECT * FROM signals ${clause} ORDER BY created_at DESC`)
    .all(...args) as SignalRow[];
  return rows.map(rowToSignal);
};

export const getSignal = (client: MemexClient, id: number): Signal | undefined => {
  const row = client.sqlite.prepare('SELECT * FROM signals WHERE id = ?').get(id) as
    | SignalRow
    | undefined;
  return row ? rowToSignal(row) : undefined;
};

export const setSignalStatus = (
  client: MemexClient,
  id: number,
  status: SignalStatus,
): Signal | undefined => {
  client.sqlite
    .prepare('UPDATE signals SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
  const row = client.sqlite.prepare('SELECT * FROM signals WHERE id = ?').get(id) as
    | SignalRow
    | undefined;
  return row ? rowToSignal(row) : undefined;
};

// ── Detectors ──────────────────────────────────────────────────────────────
// Each detector is a pure read over the corpus returning candidates. Persisting
// them via upsertSignal is the caller's job, so detection stays testable and
// free of side effects.

const DAY_MS = 86_400_000;
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

type NoteRow = {
  id: number;
  title: string;
  content: string;
  tags: string;
  layer: string;
  category: string | null;
  created_at: number;
  updated_at: number;
};

// dangling_link: a [[Title]] reference whose target note does not exist.
// Identity = source note + missing title (lowercased), so one note can raise
// distinct signals for distinct missing targets.
export const detectDanglingLinks = (client: MemexClient): SignalCandidate[] => {
  const notes = client.sqlite.prepare('SELECT id, title, content FROM notes').all() as Pick<
    NoteRow,
    'id' | 'title' | 'content'
  >[];

  const titleExists = new Set(notes.map((n) => n.title.trim().toLowerCase()));
  const candidates: SignalCandidate[] = [];
  const seen = new Set<string>();

  for (const note of notes) {
    const titles = [...note.content.matchAll(WIKI_LINK_RE)].map((m) => m[1].trim());
    for (const title of titles) {
      const key = title.toLowerCase();
      if (titleExists.has(key)) continue;
      const dedup = `${note.id}:${key}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      candidates.push({
        type: 'dangling_link',
        evidenceIds: [note.id],
        reasoning: `Note #${note.id} links to "${title}", which has no note yet (open question).`,
        identity: dedup,
      });
    }
  }
  return candidates;
};

export type StaleStateOptions = { maxDistance?: number; minNewer?: number };

// stale_state: a `state` note that has accumulated semantically-related `past`
// notes created AFTER it was last updated — i.e. its "current truth" may be out
// of date. Identity = the state note id (one open question per stale state).
export const detectStaleState = (
  client: MemexClient,
  options: StaleStateOptions = {},
): SignalCandidate[] => {
  const maxDistance = options.maxDistance ?? 0.45;
  const minNewer = options.minNewer ?? 3;

  const states = client.sqlite
    .prepare("SELECT id, title, updated_at FROM notes WHERE layer = 'state'")
    .all() as { id: number; title: string; updated_at: number }[];

  const candidates: SignalCandidate[] = [];

  for (const state of states) {
    const embRow = client.sqlite
      .prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?')
      .get(BigInt(state.id)) as { embedding: Buffer } | undefined;
    if (!embRow) continue;

    const newer = client.sqlite
      .prepare(
        `SELECT n.id, e.distance
         FROM note_embeddings e
         JOIN notes n ON n.id = e.note_id
         WHERE e.embedding MATCH ?
           AND k = ?
           AND n.id != ?
           AND n.layer = 'past'
           AND n.created_at > ?
           AND e.distance < ?
         ORDER BY e.distance`,
      )
      // k is applied by the ANN index BEFORE the WHERE filters, so it must be
      // generous enough that date/layer-relevant notes are not crowded out by
      // nearer-but-irrelevant ones. Cheap at personal scale.
      .all(embRow.embedding, 250, state.id, state.updated_at, maxDistance) as {
      id: number;
      distance: number;
    }[];

    if (newer.length < minNewer) continue;

    candidates.push({
      type: 'stale_state',
      evidenceIds: [state.id, ...newer.map((n) => n.id)],
      reasoning: `State note #${state.id} "${state.title}" has ${newer.length} related past notes created after its last update — may be out of date.`,
      identity: String(state.id),
    });
  }
  return candidates;
};

export type TagBurstOptions = {
  windowDays?: number;
  dormantDays?: number;
  minBurst?: number;
  now?: number;
  // Workflow/utility tags (e.g. "todo", "draft") naturally burst from app usage
  // rather than thinking — exclude them.
  ignoreTags?: string[];
};

// tag_burst: a tag that was dormant for a long stretch and then surged again.
// Distinguishes a genuine revival ("surging interest") from a brand-new tag or
// a steady-use tag. Identity = tag + burst month, so each distinct revival
// surfaces once.
export const detectTagBursts = (
  client: MemexClient,
  options: TagBurstOptions = {},
): SignalCandidate[] => {
  const now = options.now ?? Date.now();
  const windowMs = (options.windowDays ?? 14) * DAY_MS;
  const dormantMs = (options.dormantDays ?? 180) * DAY_MS;
  const minBurst = options.minBurst ?? 3;
  const ignore = new Set(options.ignoreTags ?? []);
  const windowStart = now - windowMs;

  const rows = client.sqlite
    .prepare(
      `SELECT n.id, t.value AS tag, COALESCE(n.authored_at, n.created_at) AS created_at
       FROM notes n, json_each(n.tags) t`,
    )
    .all() as { id: number; tag: string; created_at: number }[];

  const byTag = new Map<string, { id: number; created_at: number }[]>();
  for (const r of rows) {
    if (ignore.has(r.tag)) continue;
    const list = byTag.get(r.tag) ?? [];
    list.push({ id: r.id, created_at: r.created_at });
    byTag.set(r.tag, list);
  }

  const candidates: SignalCandidate[] = [];

  for (const [tag, entries] of byTag) {
    const recent = entries.filter((e) => e.created_at >= windowStart);
    if (recent.length < minBurst) continue;

    const priorTimestamps = entries
      .filter((e) => e.created_at < windowStart)
      .map((e) => e.created_at);
    // A brand-new tag (no prior history) is not a "revival".
    if (priorTimestamps.length === 0) continue;

    const lastPrior = Math.max(...priorTimestamps);
    const burstStart = Math.min(...recent.map((e) => e.created_at));
    if (burstStart - lastPrior < dormantMs) continue; // not dormant long enough

    const dormantDaysActual = Math.floor((burstStart - lastPrior) / DAY_MS);
    candidates.push({
      type: 'tag_burst',
      evidenceIds: recent.map((e) => e.id),
      reasoning: `Tag "${tag}" resurfaced: ${recent.length} notes in the last ${options.windowDays ?? 14}d after ~${dormantDaysActual}d dormant.`,
      // Anchor identity on the dormancy that preceded the burst: the signal
      // stays the same id while the burst continues, and only a fresh dormant
      // stretch produces a new alert.
      identity: `${tag}:revived-after-${lastPrior}`,
    });
  }
  return candidates;
};

export type HiddenArcOptions = {
  knn?: number;
  knnDistance?: number;
  minMembers?: number;
  maxMembers?: number;
  minSpanDays?: number;
  maxLinkDensity?: number;
  minAvgDaysBetween?: number;
};

const linkDensity = (client: MemexClient, ids: number[]): number => {
  const placeholders = ids.map(() => '?').join(',');
  const { linkCount } = client.sqlite
    .prepare(
      `SELECT COUNT(DISTINCT
         CASE WHEN source_id < target_id
           THEN source_id || '-' || target_id
           ELSE target_id || '-' || source_id END) AS linkCount
       FROM note_links
       WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders})`,
    )
    .get(...ids, ...ids) as { linkCount: number };
  const possiblePairs = (ids.length * (ids.length - 1)) / 2;
  return possiblePairs > 0 ? linkCount / possiblePairs : 1;
};

// hidden_arc: a cluster of notes that clearly belong together but were never
// connected (low link density) and play out over a long time — an
// un-synthesized "arc" the author lived through without stepping back to name
// it. Discovery is purely embedding-driven (tag-independent): tag-frequency
// seeding structurally misses the best arcs, because the more meaningful a
// theme is, the MORE notes carry its tag, pushing it past any frequency cap.
//
// Method: build a MUTUAL-kNN graph (edge a–b only if each is in the other's
// top-k within distance T). Mutuality kills "hub" notes that would otherwise
// merge unrelated arcs into one giant blob. Union-find yields disjoint
// components (so no overlap reduction is needed); then filter by size, span,
// link density, and temporal uniformity. The tag is attached afterwards as a
// human-readable label only.
export const detectHiddenArcs = (
  client: MemexClient,
  options: HiddenArcOptions = {},
): SignalCandidate[] => {
  const knn = options.knn ?? 8;
  // L2 on normalized vectors. Empirically 0.45 (≈cos 0.90) is the sweet spot on
  // a real personal corpus: 0.55 over-merges everything into a few giant
  // "topic" blobs that exceed maxMembers, while ~0.40 fragments true arcs.
  const knnDistance = options.knnDistance ?? 0.45;
  const minMembers = options.minMembers ?? 4;
  const maxMembers = options.maxMembers ?? 12;
  const minSpanMs = (options.minSpanDays ?? 180) * DAY_MS;
  const maxLinkDensity = options.maxLinkDensity ?? 0.2;
  const minAvgDaysBetween = options.minAvgDaysBetween ?? 14;

  // 1. Each note's k nearest neighbours within T (one query per note).
  const embedded = client.sqlite
    .prepare(
      `SELECT n.id FROM notes n
       JOIN note_embeddings e ON e.note_id = n.id`,
    )
    .all() as { id: number }[];

  const embQuery = client.sqlite.prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?');
  const neighborQuery = client.sqlite.prepare(
    `SELECT note_id AS id
     FROM note_embeddings
     WHERE embedding MATCH ? AND k = ? AND distance < ?`,
  );

  const neighbors = new Map<number, Set<number>>();
  for (const { id } of embedded) {
    const embRow = embQuery.get(BigInt(id)) as { embedding: Buffer } | undefined;
    if (!embRow) continue;
    const rows = neighborQuery.all(embRow.embedding, knn + 1, knnDistance) as { id: number }[];
    neighbors.set(id, new Set(rows.map((r) => r.id).filter((nid) => nid !== id)));
  }

  // 2. Union-find over mutual edges only.
  const parent = new Map<number, number>();
  for (const { id } of embedded) parent.set(id, id);
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number) => parent.set(find(a), find(b));

  for (const [a, nbs] of neighbors) {
    for (const b of nbs) {
      if (neighbors.get(b)?.has(a)) union(a, b); // mutual only
    }
  }

  const groups = new Map<number, number[]>();
  for (const { id } of embedded) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }

  // 3. Filter components into arcs.
  const candidates: SignalCandidate[] = [];
  for (const ids of groups.values()) {
    if (ids.length < minMembers || ids.length > maxMembers) continue;

    const meta = client.sqlite
      .prepare(
        `SELECT COALESCE(authored_at, created_at) AS created_at, tags
         FROM notes WHERE id IN (${ids.map(() => '?').join(',')})`,
      )
      .all(...ids) as { created_at: number; tags: string }[];

    const times = meta.map((m) => m.created_at);
    const span = Math.max(...times) - Math.min(...times);
    if (span < minSpanMs) continue;

    const spanDays = span / DAY_MS;
    // Temporal uniformity: an arc is periodic reflection (notes weeks apart),
    // not a daily-grind work stream. This is the "work-log killer".
    if (spanDays / ids.length < minAvgDaysBetween) continue;

    if (linkDensity(client, ids) >= maxLinkDensity) continue;

    // Most common tag → human-readable label only.
    const tagCounts = new Map<string, number>();
    for (const m of meta) {
      for (const t of parseTags(m.tags)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const label = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'untagged';

    const sortedIds = [...ids].sort((a, b) => a - b);
    candidates.push({
      type: 'hidden_arc',
      evidenceIds: sortedIds,
      reasoning: `Arc around "${label}": ${ids.length} notes over ~${Math.floor(spanDays)}d, no internal links — an un-synthesized thread.`,
      // Anchor identity on the earliest note in the component: stable as the
      // arc grows (the founding note rarely leaves), so triage decisions stick.
      identity: `arc:${sortedIds[0]}`,
    });
  }
  return candidates;
};

const REFRESH_META_KEY = 'signals_refreshed_at';

const maxNotesUpdatedAt = (client: MemexClient): number =>
  (client.sqlite.prepare('SELECT MAX(updated_at) AS m FROM notes').get() as { m: number | null })
    .m ?? 0;

const getMeta = (client: MemexClient, key: string): number =>
  (
    client.sqlite.prepare('SELECT value FROM engine_meta WHERE key = ?').get(key) as
      | { value: number }
      | undefined
  )?.value ?? 0;

const setMeta = (client: MemexClient, key: string, value: number): void => {
  client.sqlite
    .prepare('INSERT OR REPLACE INTO engine_meta(key, value) VALUES (?, ?)')
    .run(key, value);
};

// Run all detectors and persist their candidates. Returns the signals touched.
//
// Dirty-flag: detection is skipped when no note has changed since the last
// refresh, so on-read detection (memex signals / digest / MCP get_signals) is
// effectively free on a static corpus and only pays the O(N·kNN) cost when
// something actually changed. Pass force to bypass (e.g. after a deletion,
// which does not bump updated_at).
export const refreshSignals = (
  client: MemexClient,
  options: {
    stale?: StaleStateOptions;
    burst?: TagBurstOptions;
    arc?: HiddenArcOptions;
    force?: boolean;
  } = {},
): Signal[] => {
  if (!options.force && maxNotesUpdatedAt(client) <= getMeta(client, REFRESH_META_KEY)) {
    return [];
  }
  const candidates = [
    ...detectDanglingLinks(client),
    ...detectStaleState(client, options.stale),
    ...detectTagBursts(client, options.burst),
    ...detectHiddenArcs(client, options.arc),
  ];
  const touched = candidates.map((c) => upsertSignal(client, c));
  setMeta(client, REFRESH_META_KEY, Date.now());
  return touched;
};

/**
 * Pick the most interesting "new" signal that involves the given note.
 * Used for proactive hints during save/update.
 */
export const findBestProactiveSignal = (signals: Signal[], noteId: number): Signal | undefined => {
  const candidates = signals.filter((s) => s.status === 'new' && s.evidenceIds.includes(noteId));

  const priority: Record<SignalType, number> = {
    hidden_arc: 1,
    tag_burst: 2,
    stale_state: 3,
    dangling_link: 4,
  };

  return candidates.sort((a, b) => {
    if (priority[a.type] !== priority[b.type]) {
      return priority[a.type] - priority[b.type];
    }
    // For same type, prefer larger evidence set
    return b.evidenceIds.length - a.evidenceIds.length;
  })[0];
};
