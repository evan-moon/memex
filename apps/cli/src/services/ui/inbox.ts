import {
  getAmendmentsFor,
  getNote,
  listSignals,
  type MemexClient,
  type Signal,
  type SignalStatus,
  type SignalType,
  setSignalStatus,
} from '@memex/db';

export type InboxNote = {
  id: number;
  title: string;
  layer: string;
  authoredAt: number;
  supersededBy: { id: number; title: string } | null;
};

export type InboxSignal = {
  id: number;
  type: SignalType;
  reasoning: string | null;
  createdAt: number;
  evidence: InboxNote[];
};

export type Inbox = {
  counts: Record<string, number>;
  signals: InboxSignal[];
};

// dangling_link is 82% of the queue and is a broken wiki link, not something
// learned — kept countable but out of the default view, where it would bury the
// arcs and the stale plans that are the reason to open this at all.
export const MAINTENANCE_TYPES: SignalType[] = ['dangling_link'];

const noteOf = (
  client: MemexClient,
  id: number,
  amendments: Map<number, { id: number; title: string }[]>,
): InboxNote | null => {
  const note = getNote(client, id);
  if (!note) return null;
  const chain = amendments.get(id) ?? [];
  const newest = chain.at(-1);
  return {
    id: note.id,
    title: note.title,
    layer: note.layer,
    authoredAt: note.authoredAt ?? note.createdAt,
    supersededBy: newest ? { id: newest.id, title: newest.title } : null,
  };
};

export const buildInbox = (client: MemexClient, includeMaintenance = false): Inbox => {
  const all = listSignals(client, { status: 'new' });
  const counts = all.reduce<Record<string, number>>(
    (acc, s) => ({ ...acc, [s.type]: (acc[s.type] ?? 0) + 1 }),
    {},
  );
  const visible = includeMaintenance ? all : all.filter((s) => !MAINTENANCE_TYPES.includes(s.type));

  const evidenceIds = [...new Set(visible.flatMap((s) => s.evidenceIds))];
  const amendments = getAmendmentsFor(client, evidenceIds);

  return {
    counts,
    signals: visible.map((signal) => ({
      id: signal.id,
      type: signal.type,
      reasoning: signal.reasoning,
      createdAt: signal.createdAt,
      evidence: signal.evidenceIds
        .map((id) => noteOf(client, id, amendments))
        .filter((n): n is InboxNote => n !== null),
    })),
  };
};

export const triageSignal = (
  client: MemexClient,
  id: number,
  status: SignalStatus,
): Signal | undefined => setSignalStatus(client, id, status);
