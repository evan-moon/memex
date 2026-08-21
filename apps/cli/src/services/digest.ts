import {
  findFlashbacks,
  getNote,
  listInferences,
  listNotesSince,
  listSignals,
  type MemexClient,
  parseTags,
  refreshInferenceStaleness,
  refreshSignals,
  type SignalType,
} from '@memex/db';

const DAY = 86_400_000;
const ATTENTION = 3;
const ROOT = '(root)';

// The vector search picks its neighbours before the date and folder filters
// run, so a small k hands those filters nothing but recent same-folder notes.
const CONNECTION_POOL = 100;
// Measured against this vault: no cross-folder note 90 days apart sits closer
// than ~0.47, so the 0.4 the save path uses can never match. Half the recent
// notes have a neighbour under 0.5; past 0.55 every note has one, which is the
// same as having none.
const CONNECTION_MAX_DISTANCE = 0.5;
const CONNECTION_SCAN = 10;

export type DigestNote = { id: number; title: string; layer: string; at: number; tags: string[] };

export type DigestFolder = { folder: string; notes: DigestNote[] };

export type DigestAttention = { id: number; title: string; count: number };

export type DigestConnection = { from: DigestNote; to: DigestNote; daysApart: number };

export type Digest = {
  days: number;
  since: number;
  total: number;
  folders: DigestFolder[];
  signals: { type: SignalType; count: number }[];
  attention: DigestAttention[];
  inferences: { active: { id: number; title: string }[]; stale: { id: number; title: string }[] };
  connection: DigestConnection | null;
};

export const SIGNAL_ORDER: SignalType[] = [
  'hidden_arc',
  'stale_state',
  'tag_burst',
  'dangling_link',
];

type Sourced = {
  id: number;
  title: string;
  layer: string;
  tags: string;
  category: string | null;
  createdAt: number;
  authoredAt: number | null;
};

const toDigestNote = (note: Sourced): DigestNote => ({
  id: note.id,
  title: note.title,
  layer: note.layer,
  at: note.authoredAt ?? note.createdAt,
  tags: parseTags(note.tags),
});

const foldersOf = (notes: Sourced[]): DigestFolder[] =>
  [
    ...notes.reduce((acc, note) => {
      const folder = note.category ?? ROOT;
      return acc.set(folder, [...(acc.get(folder) ?? []), toDigestNote(note)]);
    }, new Map<string, DigestNote[]>()),
  ]
    .map(([folder, folderNotes]) => ({ folder, notes: folderNotes }))
    .sort((a, b) => b.notes.length - a.notes.length || a.folder.localeCompare(b.folder));

const signalCounts = (client: MemexClient) => {
  const counts = listSignals(client, { status: 'new' }).reduce(
    (acc, s) => acc.set(s.type, (acc.get(s.type) ?? 0) + 1),
    new Map<SignalType, number>(),
  );
  return SIGNAL_ORDER.filter((type) => counts.has(type)).map((type) => ({
    type,
    count: counts.get(type) ?? 0,
  }));
};

// What is worth a person's hand today: the state notes with the most records
// piled up behind them, which is the one signal that names a specific fix.
const attentionOf = (client: MemexClient): DigestAttention[] =>
  listSignals(client, { type: 'stale_state', status: 'new' })
    .flatMap((signal) => {
      const [stateId, ...newer] = signal.evidenceIds;
      if (stateId === undefined) return [];
      const note = getNote(client, stateId);
      return note ? [{ id: note.id, title: note.title, count: newer.length }] : [];
    })
    .sort((a, b) => b.count - a.count || b.id - a.id)
    .slice(0, ATTENTION);

// Scanned over the newest notes rather than the ones inside the window: a
// quiet week is exactly when a rediscovery is worth the most, and an empty
// window would take the block away right then.
const connectionOf = (client: MemexClient, now: number) => {
  const newest = client.sqlite
    .prepare(
      `SELECT id, title, layer, tags, category, created_at AS createdAt,
              authored_at AS authoredAt
       FROM notes ORDER BY created_at DESC LIMIT ?`,
    )
    .all(CONNECTION_SCAN) as Sourced[];

  return newest.reduce<DigestConnection | null>((found, note) => {
    if (found) return found;
    const [flashback] = findFlashbacks(client, note.id, now, {
      limit: CONNECTION_POOL,
      maxDistance: CONNECTION_MAX_DISTANCE,
    });
    if (!flashback) return null;
    const from = toDigestNote(note);
    const to = toDigestNote(flashback);
    return { from, to, daysApart: Math.floor((from.at - to.at) / DAY) };
  }, null);
};

export const buildDigest = (
  client: MemexClient,
  { days, now = Date.now() }: { days: number; now?: number },
): Digest => {
  const since = now - days * DAY;
  const notes = listNotesSince(client, since);

  refreshSignals(client);
  refreshInferenceStaleness(client);

  return {
    days,
    since,
    total: notes.length,
    folders: foldersOf(notes),
    signals: signalCounts(client),
    attention: attentionOf(client),
    inferences: {
      active: listInferences(client, { status: 'active' }).map((i) => ({
        id: i.id,
        title: i.title,
      })),
      stale: listInferences(client, { status: 'stale' }).map((i) => ({
        id: i.id,
        title: i.title,
      })),
    },
    connection: connectionOf(client, now),
  };
};
