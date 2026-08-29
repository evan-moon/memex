import { getCorpusStats, type MemexClient } from '@memex/db';
import { listTags } from './tidy.ts';
import { buildChores } from './ui/chores.ts';

export const AXIS_WEIGHTS = {
  grounded: 30,
  fresh: 30,
  connected: 25,
  tidy: 15,
} as const;

export type AxisKey = keyof typeof AXIS_WEIGHTS;

export type AuditCounts = Record<AxisKey, { have: number; total: number }>;

export type AuditAxis = {
  key: AxisKey;
  weight: number;
  have: number;
  total: number;
  earned: number;
  lost: number;
};

export type AuditHint = { id: number | null; label: string; detail: string };

export type Audit = {
  score: number;
  axes: AuditAxis[];
  weakest: AuditAxis | null;
  hint: AuditHint | null;
};

const ratio = ({ have, total }: { have: number; total: number }) =>
  total === 0 ? 1 : Math.min(1, Math.max(0, have / total));

const toAxis = (key: AxisKey, counts: AuditCounts): AuditAxis => {
  const weight = AXIS_WEIGHTS[key];
  const earned = weight * ratio(counts[key]);
  return { key, weight, ...counts[key], earned, lost: weight - earned };
};

const AXIS_ORDER: AxisKey[] = ['grounded', 'fresh', 'connected', 'tidy'];

export const scoreAudit = (counts: AuditCounts, hint: AuditHint | null = null): Audit => {
  const axes = AXIS_ORDER.map((key) => toAxis(key, counts));
  const worst = axes.reduce((acc, axis) => (axis.lost > acc.lost ? axis : acc));
  return {
    score: Math.round(axes.reduce((sum, axis) => sum + axis.earned, 0)),
    axes,
    weakest: worst.lost > 0 ? worst : null,
    hint: worst.lost > 0 ? hint : null,
  };
};

const countPersonState = (client: MemexClient): number =>
  (
    client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM notes WHERE layer = 'state' AND author = 'person'")
      .get() as { n: number }
  ).n;

type Chores = ReturnType<typeof buildChores>;

const hintFor = (key: AxisKey, chores: Chores): AuditHint | null => {
  if (key === 'grounded') {
    const top = chores.undeclared.top[0];
    return top
      ? { id: top.id, label: top.title, detail: `${top.candidates} evidence candidates waiting` }
      : null;
  }
  if (key === 'fresh') {
    const top = chores.staleNotes.top[0];
    return top
      ? { id: top.id, label: top.title, detail: `${top.count} newer notes piled up since` }
      : null;
  }
  if (key === 'connected') {
    const top = chores.deadLinks.top[0];
    return top
      ? { id: top.id, label: top.title, detail: `links nowhere: ${top.targets.join(', ')}` }
      : null;
  }
  const top = chores.looseTags.top[0];
  return top ? { id: null, label: `#${top}`, detail: 'used exactly once' } : null;
};

export const buildAudit = (client: MemexClient, vaultPath: string): Audit => {
  const chores = buildChores(client, vaultPath);
  const stats = getCorpusStats(client);

  const stateTotal = stats.notesByLayer.find((row) => row.key === 'state')?.count ?? 0;
  const resolvedLinks = stats.linksBySource.find((row) => row.key === 'wiki')?.count ?? 0;
  const personState = countPersonState(client);
  const tagTotal = listTags(client, vaultPath).length;

  const counts: AuditCounts = {
    grounded: { have: personState - chores.undeclared.total, total: personState },
    fresh: { have: stateTotal - chores.staleNotes.total, total: stateTotal },
    connected: {
      have: resolvedLinks,
      total: resolvedLinks + chores.deadLinks.total,
    },
    tidy: { have: tagTotal - chores.looseTags.all, total: tagTotal },
  };

  const provisional = scoreAudit(counts);
  return provisional.weakest
    ? scoreAudit(counts, hintFor(provisional.weakest.key, chores))
    : provisional;
};
