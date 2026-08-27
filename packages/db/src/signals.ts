import { createHash } from 'node:crypto';
import type { MemexClient } from './client.ts';
import { dismissedDanglingNoteIds } from './dangling.ts';
import { notesDeclaringEvidence } from './evidence.ts';
import { unresolvedLinksByNote, unresolvedLinksFor } from './link-index.ts';
import { parseTags } from './repository.ts';
import { type ChangeKind, changeHead, hasChangeFrom, trimChangeLog } from './changes.ts';

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

export type SignalType =
  | 'hidden_arc'
  | 'dangling_link'
  | 'stale_state'
  | 'tag_burst'
  | 'conflict_candidate';
export type SignalStatus = 'new' | 'snoozed' | 'dismissed' | 'minted';

// conflict_candidate is nominated on demand, not swept for, so it has no
// watermark and is never retired by a refresh.
const REFRESHABLE = ['dangling_link', 'stale_state', 'tag_burst', 'hidden_arc'] as const;
type RefreshableType = (typeof REFRESHABLE)[number];

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

export const getSignalByHash = (client: MemexClient, hash: string): Signal | undefined => {
  const row = client.sqlite.prepare('SELECT * FROM signals WHERE signal_hash = ?').get(hash) as
    | SignalRow
    | undefined;
  return row ? rowToSignal(row) : undefined;
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

// dangling_link: a [[Title]] reference whose target note does not exist.
// Identity = source note + missing title (lowercased), so one note can raise
// distinct signals for distinct missing targets.
const danglingCandidates = (
  noteId: number,
  targets: string[],
  seen: Set<string>,
): SignalCandidate[] =>
  targets.flatMap((title) => {
    const dedup = `${noteId}:${title.toLowerCase()}`;
    if (seen.has(dedup)) return [];
    seen.add(dedup);
    return [
      {
        type: 'dangling_link' as const,
        evidenceIds: [noteId],
        reasoning: `Note #${noteId} links to "${title}", which has no note yet (open question).`,
        identity: dedup,
      },
    ];
  });

export const detectDanglingLinks = (client: MemexClient): SignalCandidate[] => {
  const dismissed = new Set(dismissedDanglingNoteIds(client));
  const seen = new Set<string>();

  return [...unresolvedLinksByNote(client)]
    .filter(([noteId]) => !dismissed.has(noteId))
    .flatMap(([noteId, targets]) => danglingCandidates(noteId, targets, seen));
};

// The same question asked of one note. A write needs to know what it just broke,
// not what the whole vault has left open.
export const detectDanglingLinksFor = (
  client: MemexClient,
  noteId: number,
): SignalCandidate[] =>
  dismissedDanglingNoteIds(client).includes(noteId)
    ? []
    : danglingCandidates(noteId, unresolvedLinksFor(client, noteId), new Set());

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

  // A note that names its sources is checked by comparing them, not by asking
  // which notes look close enough to matter. Guessing is what is left for the
  // ones that have not said.
  const declared = new Set(notesDeclaringEvidence(client));
  const states = (
    client.sqlite
      .prepare("SELECT id, title, updated_at FROM notes WHERE layer = 'state'")
      .all() as { id: number; title: string; updated_at: number }[]
  ).filter((state) => !declared.has(state.id));

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
           AND COALESCE(n.authored_at, n.created_at) > ?
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

export type ConflictOptions = {
  maxDistance?: number;
  crossAuthorDistance?: number;
  neighbours?: number;
};

type Judgement = { id: number; title: string; layer: string; author: string };

const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

// Pairs already reconciled by hand. A correction is the author saying which of
// the two survives, so re-asking whether they disagree is asking a question
// that was already answered.
const reconciledPairs = (client: MemexClient): Set<string> =>
  new Set(
    (
      client.sqlite
        .prepare("SELECT source_id, target_id FROM note_links WHERE source = 'amends'")
        .all() as { source_id: number; target_id: number }[]
    ).map((row) => pairKey(row.source_id, row.target_id)),
  );

// Two judgements that sit close together but were written far apart are where
// a position quietly reverses. Whether they actually disagree is not something
// distance can answer -- an embedding puts a claim and its negation side by
// side -- so this only nominates the pair. The verdict is the agent's.
//
// `rule` notes are compared exhaustively because they govern behaviour and
// there are few of them; a contradiction between two of them is the most
// expensive kind to leave standing.
export const detectConflictPairs = (
  client: MemexClient,
  options: ConflictOptions = {},
): SignalCandidate[] => {
  const maxDistance = options.maxDistance ?? 0.35;
  // Two writers recording the same subject phrase it differently enough that a
  // tight cap misses them, and the pairs found here have been worth the extra
  // reach: of the judgements sitting between a person note and the agent's own
  // copy, the ones that turned out to disagree or to be duplicates all sat
  // further apart than two notes by the same hand ever need to.
  const crossDistance = options.crossAuthorDistance ?? 0.4;
  // k is applied by the ANN index BEFORE the layer filter, so a small k returns
  // the nearest notes of every layer and leaves almost no judgements standing.
  // Measured here: k=25 found 8 pairs where k=250 finds the ones that matter.
  const neighbours = options.neighbours ?? 250;
  const reconciled = reconciledPairs(client);
  const seen = new Set<string>();
  const candidates: SignalCandidate[] = [];
  const distances = new Map<string, number>();

  const crossAuthor = new Set<string>();

  const nominate = (a: Judgement, b: Judgement, why: string) => {
    const key = pairKey(a.id, b.id);
    if (a.id === b.id || seen.has(key) || reconciled.has(key)) return;
    seen.add(key);
    if (a.author !== b.author) crossAuthor.add(key);
    candidates.push({
      type: 'conflict_candidate',
      evidenceIds: [a.id, b.id],
      reasoning: `#${a.id} "${a.title}" and #${b.id} "${b.title}" ${why}. Do they actually disagree?`,
      identity: key,
    });
  };

  const neighboursOf = (id: number, layer: string, cap: number | null) => {
    const embRow = client.sqlite
      .prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?')
      .get(BigInt(id)) as { embedding: Buffer } | undefined;
    if (!embRow) return [];

    return client.sqlite
      .prepare(
        `SELECT n.id, e.distance
         FROM note_embeddings e
         JOIN notes n ON n.id = e.note_id
         WHERE e.embedding MATCH ?
           AND k = ?
           AND n.id != ?
           AND n.layer = ?
           ${cap === null ? '' : 'AND e.distance < ?'}
         ORDER BY e.distance`,
      )
      .all(...[embRow.embedding, neighbours, id, layer, ...(cap === null ? [] : [cap])]) as {
      id: number;
      distance: number;
    }[];
  };

  const remember = (id: number, near: { id: number; distance: number }[]) => {
    for (const row of near) {
      const key = pairKey(id, row.id);
      const known = distances.get(key);
      if (known === undefined || row.distance < known) distances.set(key, row.distance);
    }
  };

  const rules = client.sqlite
    .prepare("SELECT id, title, layer, author FROM notes WHERE layer = 'rule' ORDER BY id")
    .all() as Judgement[];
  for (const [index, rule] of rules.entries()) {
    // Uncapped: rules are compared exhaustively anyway, so the neighbourhood is
    // read only to learn which of those pairs to ask about first.
    remember(rule.id, neighboursOf(rule.id, 'rule', null));
    for (const other of rules.slice(index + 1)) {
      nominate(rule, other, 'both instruct how to act');
    }
  }

  const states = client.sqlite
    .prepare("SELECT id, title, layer, author FROM notes WHERE layer = 'state' ORDER BY id")
    .all() as Judgement[];
  const byId = new Map(states.map((state) => [state.id, state]));

  for (const state of states) {
    const near = neighboursOf(state.id, 'state', Math.max(maxDistance, crossDistance));
    remember(state.id, near);
    for (const row of near) {
      const other = byId.get(row.id);
      if (!other) continue;
      const cap = state.author === other.author ? maxDistance : crossDistance;
      if (row.distance < cap) nominate(state, other, 'claim something about the same subject');
    }
  }

  // Closest first, and a pair written by two different hands before a pair
  // written by one. Measured on this vault: every disagreement and every
  // duplicate found so far sat between a note the person wrote and the agent's
  // own copy of it, and none sat between two notes the person wrote. It is the
  // same subject recorded twice by two writers who never read each other.
  const distanceOf = (candidate: SignalCandidate) =>
    distances.get(candidate.identity ?? '') ?? Number.POSITIVE_INFINITY;
  const rank = (candidate: SignalCandidate) => (crossAuthor.has(candidate.identity ?? '') ? 0 : 1);

  return candidates.sort((a, b) => rank(a) - rank(b) || distanceOf(a) - distanceOf(b));
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
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) ?? cur;
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

// What each detector reads. A detector is re-run only when the log holds a
// change of a kind it can see: renaming a tag cannot move an embedding, so it
// has no business costing a kNN sweep of the whole corpus.
const WATCHES: Record<RefreshableType, ChangeKind[]> = {
  dangling_link: ['content', 'title', 'links', 'removed'],
  stale_state: ['content', 'removed'],
  tag_burst: ['tags', 'content', 'removed'],
  hidden_arc: ['content', 'links', 'removed'],
};

const watermarkKey = (type: RefreshableType) => `signals_watermark:${type}`;

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

// A signal is an observation, not a record: once the thing it observed is no
// longer true, it is void. Without this, fixing a dangling link left its signal
// open forever and the backlog could only grow — 152 of 502 dangling links in
// a real vault pointed at notes that had since been written. Only untriaged
// signals are dropped; dismissed and minted are decisions, and re-raising those
// would argue with the user.
const retireResolved = (
  client: MemexClient,
  candidates: SignalCandidate[],
  ran: Set<RefreshableType>,
) => {
  const live = new Set(candidates.map(computeSignalHash));
  const open = client.sqlite
    .prepare("SELECT id, type, signal_hash FROM signals WHERE status = 'new'")
    .all() as { id: number; type: SignalType; signal_hash: string }[];

  // Only a detector that just ran can say its findings are void. Retiring on
  // behalf of one that was skipped would delete every signal it ever raised.
  const gone = open.filter(
    (row) => ran.has(row.type as RefreshableType) && !live.has(row.signal_hash),
  );
  if (gone.length === 0) return;

  const remove = client.sqlite.prepare('DELETE FROM signals WHERE id = ?');
  client.sqlite.transaction(() => {
    for (const row of gone) remove.run(row.id);
  })();
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
  const head = changeHead(client);

  const detectors: Record<RefreshableType, () => SignalCandidate[]> = {
    dangling_link: () => detectDanglingLinks(client),
    stale_state: () => detectStaleState(client, options.stale),
    tag_burst: () => detectTagBursts(client, options.burst),
    hidden_arc: () => detectHiddenArcs(client, options.arc),
  };

  // A watermark of zero means this detector has never read the log — on a vault
  // that predates it, or one that has just been opened. It runs once to learn
  // what is already there, and is skipped by the log after that.
  const due = REFRESHABLE.filter((type) => {
    const from = getMeta(client, watermarkKey(type));
    return options.force || from === 0 || hasChangeFrom(client, from, WATCHES[type]);
  });
  if (due.length === 0) return [];

  const candidates = due.flatMap((type) => detectors[type]());
  const touched = candidates.map((c) => upsertSignal(client, c));
  retireResolved(client, candidates, new Set(due));
  for (const type of due) setMeta(client, watermarkKey(type), head + 1);
  trimChangeLog(client, Math.min(...REFRESHABLE.map((t) => getMeta(client, watermarkKey(t)))) - 1);

  return touched;
};

// One signal about the note just written, from the detectors that can answer
// for a single note without reading the corpus. stale_state and hidden_arc are
// findings about the whole vault, not about this write, and they now surface on
// the next read rather than making every save pay for a full sweep.
export const proactiveSignalFor = (client: MemexClient, noteId: number): Signal | undefined => {
  const candidates = [
    ...detectDanglingLinksFor(client, noteId),
    ...detectTagBursts(client).filter((c) => c.evidenceIds.includes(noteId)),
  ];
  const touched = candidates.map((c) => upsertSignal(client, c));
  return findBestProactiveSignal(touched, noteId);
};

/**
 * Pick the most interesting "new" signal that involves the given note.
 * Used for proactive hints during save/update.
 */
export const findBestProactiveSignal = (signals: Signal[], noteId: number): Signal | undefined => {
  const candidates = signals.filter((s) => s.status === 'new' && s.evidenceIds.includes(noteId));

  const priority: Record<SignalType, number> = {
    conflict_candidate: 0,
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
