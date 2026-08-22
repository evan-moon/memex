import type { ThreadStep } from './api.ts';

export type PlacedStep = {
  id: number;
  title: string;
  layer: string;
  at: number;
  row: number;
  lane: number;
  forks: boolean;
  trunk: boolean;
};

export type ThreadEdge = { from: PlacedStep; to: PlacedStep };

export type ThreadLayout = { steps: PlacedStep[]; edges: ThreadEdge[]; lanes: number };

type Walked = { step: ThreadStep; parent: number | null };

const walk = (step: ThreadStep, parent: number | null): Walked[] => [
  { step, parent },
  ...step.children.flatMap((child) => walk(child, step.id)),
];

// How recent a step's whole subtree gets. The trunk follows this: of two
// corrections off the same step, the line still being written is the one the
// eye should be able to run straight down.
const reachOf = (root: ThreadStep): Map<number, number> => {
  const reach = new Map<number, number>();
  const visit = (step: ThreadStep): number => {
    const mine = step.children.reduce((most, child) => Math.max(most, visit(child)), step.at);
    reach.set(step.id, mine);
    return mine;
  };
  visit(root);
  return reach;
};

const trunkOf = (root: ThreadStep): Set<number> => {
  const reach = reachOf(root);
  const trunk = new Set<number>();
  const follow = (step: ThreadStep) => {
    trunk.add(step.id);
    const next = step.children.reduce<ThreadStep | null>(
      (best, child) =>
        best === null || (reach.get(child.id) ?? 0) > (reach.get(best.id) ?? 0) ? child : best,
      null,
    );
    if (next) follow(next);
  };
  follow(root);
  return trunk;
};

export const layoutThread = (root: ThreadStep): ThreadLayout => {
  const walked = walk(root, null);
  const trunk = trunkOf(root);
  const parentOf = new Map(walked.map((w) => [w.step.id, w.parent]));

  // Time order is what makes this a timeline, but a correction must never sit
  // above what it corrects — and a vault carries dates parsed out of titles and
  // frontmatter, so the two do disagree. Topology wins: a step's parents are
  // emitted before it, and time only decides what is left.
  const inTime = [...walked].sort((a, b) => a.step.at - b.step.at || a.step.id - b.step.id);
  const byId = new Map(walked.map((w) => [w.step.id, w.step]));
  const emitted = new Set<number>();
  const withParentsFirst = (id: number): ThreadStep[] => {
    if (emitted.has(id)) return [];
    const parentId = parentOf.get(id) ?? null;
    const before = parentId === null ? [] : withParentsFirst(parentId);
    emitted.add(id);
    const step = byId.get(id);
    return step ? [...before, step] : before;
  };
  const order = inTime.flatMap((w) => withParentsFirst(w.step.id));

  const placed = new Map<number, PlacedStep>();
  const steps = order.reduce<PlacedStep[]>((acc, step) => {
    const parentId = parentOf.get(step.id) ?? null;
    const parent = parentId === null ? null : (placed.get(parentId) ?? null);
    const widest = acc.reduce((most, s) => Math.max(most, s.lane), 0);
    const leavesTrunk = parent?.trunk === true && !trunk.has(step.id);

    const next: PlacedStep = {
      id: step.id,
      title: step.title,
      layer: step.layer,
      at: step.at,
      row: Math.max(acc.length, parent === null ? 0 : parent.row + 1),
      lane: parent === null ? 0 : leavesTrunk ? widest + 1 : parent.lane,
      forks: step.children.length > 1,
      trunk: trunk.has(step.id),
    };
    placed.set(step.id, next);
    return [...acc, next];
  }, []);

  const edges = steps.flatMap((to) => {
    const parentId = parentOf.get(to.id) ?? null;
    const from = parentId === null ? null : (placed.get(parentId) ?? null);
    return from ? [{ from, to }] : [];
  });

  return { steps, edges, lanes: Math.max(...steps.map((s) => s.lane)) + 1 };
};
