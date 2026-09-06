import {
  type Claim,
  type ConfirmDepth,
  claimEvidenceMoved,
  FRESHNESS_DAYS,
  getInference,
  getNote,
  listClaims,
  listInferences,
  type MemexClient,
  refreshInferenceStaleness,
  retrievalCounts,
  wakeDeferrals,
} from '@memex/db';

export const SESSION = 7;
const CLAIM_CHARS = 100;
const INJECTION_WINDOW_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type DeckKind = 'claim' | 'rule' | 'inference';

export type DeckCard = {
  key: string;
  kind: DeckKind;
  id: number;
  text: string;
  heading: string | null;
  since: number | null;
  confirmedAt: number | null;
  idleDays: number | null;
  injected: { hits: number; days: number };
  source: { id: number; title: string } | null;
  evidenceMoved: boolean;
};

export type Deck = { cards: DeckCard[]; session: number; binge: boolean };

// The section a claim was read out of. Two months on, the sentence alone is not
// enough to judge — the heading above it is the cheapest context there is, and it
// is already in the note.
const headingAbove = (content: string, claim: string): string | null => {
  const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
  const needle = flat(claim);
  const lines = content.split('\n');
  const at = lines.findIndex(
    (line) => needle.length > 0 && flat(line).includes(needle.slice(0, 24)),
  );
  if (at === -1) return null;
  for (let n = at; n >= 0; n -= 1) {
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(lines[n] ?? '');
    if (heading?.[1]) return heading[1].trim();
  }
  return null;
};

const daysBetween = (from: number, to: number) => Math.max(0, Math.floor((to - from) / DAY));

const injectedNoteIds = (client: MemexClient): Set<number> =>
  new Set(
    (
      client.sqlite
        .prepare('SELECT DISTINCT note_id FROM retrieval_log WHERE injected = 1')
        .all() as { note_id: number }[]
    ).map((row) => row.note_id),
  );

const injectionsFor = (client: MemexClient) => {
  const since = Date.now() - INJECTION_WINDOW_DAYS * DAY;
  return new Map(
    retrievalCounts(client, { since, injectedOnly: true }).map((row) => [row.noteId, row.hits]),
  );
};

const isExpired = (claim: Claim, now: number) => {
  if (claim.confirmedAt === null) return true;
  const depth: ConfirmDepth = claim.confirmDepth ?? 'card';
  return claim.confirmedAt + FRESHNESS_DAYS[depth] * DAY <= now;
};

// Gate ①: a claim the agent has never said is not worth anyone's attention, however
// suspect it looks. Gate ②: only what has gone stale or whose source moved.
// Gate ③ leaves the length cap — a sentence that packs four conditions into one
// line cannot be answered true or false.
const claimCards = (
  client: MemexClient,
  injected: Set<number>,
  hits: Map<number, number>,
  now: number,
): DeckCard[] =>
  listClaims(client).flatMap((claim) => {
    if (claim.status === 'closed' || claim.status === 'retracted') return [];
    // Gate ③: only a claim about what is true now. An obligation or a preference
    // has no truth value, and a record of what happened has one that never
    // changes — "is this still true?" is the wrong question for all three.
    if (claim.kind !== 'state') return [];
    if (claim.text.length > CLAIM_CHARS) return [];
    if (!injected.has(claim.noteId)) return [];

    const moved = claimEvidenceMoved(client, claim);
    if (!moved && !isExpired(claim, now)) return [];

    const note = getNote(client, claim.noteId);
    const anchor = claim.confirmedAt ?? claim.validFrom;
    const heading = note ? headingAbove(note.content, claim.text) : null;
    return [
      {
        key: `claim:${String(claim.id)}`,
        kind: 'claim' as const,
        id: claim.id,
        text: claim.text,
        heading,
        since: claim.validFrom,
        confirmedAt: claim.confirmedAt,
        idleDays: anchor === null ? null : daysBetween(anchor, now),
        injected: { hits: hits.get(claim.noteId) ?? 0, days: INJECTION_WINDOW_DAYS },
        source: note ? { id: note.id, title: note.title } : null,
        evidenceMoved: moved,
      },
    ];
  });

// A rule waiting for approval changes what the agent does the moment it is granted,
// so it never has to earn its place by having been said.
const ruleCards = (client: MemexClient, now: number): DeckCard[] =>
  (
    client.sqlite
      .prepare(
        `SELECT id, title, COALESCE(authored_at, created_at) AS at FROM notes
         WHERE layer = 'rule' AND rule_status = 'provisional'
         ORDER BY at DESC`,
      )
      .all() as { id: number; title: string; at: number }[]
  ).map((row) => ({
    key: `rule:${String(row.id)}`,
    kind: 'rule' as const,
    id: row.id,
    text: row.title,
    heading: null,
    since: row.at,
    confirmedAt: null,
    idleDays: daysBetween(row.at, now),
    injected: { hits: 0, days: INJECTION_WINDOW_DAYS },
    source: { id: row.id, title: row.title },
    evidenceMoved: false,
  }));

// `중복:` says two notes overlap. That is a fact about files, not about anything the
// agent believes wrongly, so it fails gate ③ and belongs with the vault tidying.
const isTidying = (title: string) => title.startsWith('중복:');

const inferenceCards = (
  client: MemexClient,
  injected: Set<number>,
  hits: Map<number, number>,
  now: number,
): DeckCard[] => {
  refreshInferenceStaleness(client);
  return listInferences(client, { status: 'stale' }).flatMap((row) => {
    if (isTidying(row.title)) return [];
    const found = getInference(client, row.id);
    if (!found) return [];
    const spoken = found.evidence.filter((edge) => injected.has(edge.noteId));
    if (spoken.length === 0) return [];

    const lead = found.evidence[0];
    return [
      {
        key: `inference:${String(row.id)}`,
        kind: 'inference' as const,
        id: row.id,
        text: found.inference.summary,
        heading: null,
        since: found.inference.createdAt,
        confirmedAt: null,
        idleDays: daysBetween(found.inference.createdAt, now),
        injected: {
          hits: spoken.reduce((total, edge) => total + (hits.get(edge.noteId) ?? 0), 0),
          days: INJECTION_WINDOW_DAYS,
        },
        source: lead && lead.title !== null ? { id: lead.noteId, title: lead.title } : null,
        evidenceMoved: true,
      },
    ];
  });
};

const KIND_ORDER: Record<DeckKind, number> = { rule: 0, claim: 1, inference: 2 };

const byUrgency = (a: DeckCard, b: DeckCard) =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
  Number(b.evidenceMoved) - Number(a.evidenceMoved) ||
  b.injected.hits - a.injected.hits ||
  (b.idleDays ?? 0) - (a.idleDays ?? 0);

const fingerprintOf = (card: DeckCard) => `${card.evidenceMoved ? 'moved' : 'intact'}`;

export const eligibleCards = (client: MemexClient, now = Date.now()): DeckCard[] => {
  const injected = injectedNoteIds(client);
  const hits = injectionsFor(client);
  return [
    ...ruleCards(client, now),
    ...claimCards(client, injected, hits, now),
    ...inferenceCards(client, injected, hits, now),
  ].sort(byUrgency);
};

export const buildDeck = (
  client: MemexClient,
  options: { sessions?: number; now?: number } = {},
): Deck => {
  const now = options.now ?? Date.now();
  const sessions = Math.max(1, options.sessions ?? 1);
  const found = eligibleCards(client, now);

  const { asleep } = wakeDeferrals(
    client,
    found.map((card) => ({
      itemKey: card.key,
      fingerprint: fingerprintOf(card),
      hits: card.injected.hits,
    })),
  );

  return {
    cards: found.filter((card) => !asleep.has(card.key)).slice(0, SESSION * sessions),
    session: SESSION,
    binge: sessions > 3,
  };
};

export const deckCardState = (client: MemexClient, key: string, now = Date.now()) => {
  const found = eligibleCards(client, now).find((card) => card.key === key);
  if (!found) return null;
  return {
    itemKey: found.key,
    noteId: found.source?.id ?? found.id,
    fingerprint: fingerprintOf(found),
    hits: found.injected.hits,
  };
};
