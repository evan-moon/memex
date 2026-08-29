import type { ThreadStep } from './api.ts';

// A thread reads as one line that kept being corrected, with the occasional
// place where the same note was taken in a second direction. Lanes and
// crossings are a way of drawing that, and a way that assumes the reader has
// read a commit graph before. This model says it the other way round: the line
// is the thing, and a branch is an aside hanging off a point on it.
export type ThreadLine = {
  steps: ThreadStep[];
  branches: { after: number; line: ThreadLine }[];
};

// How far forward a step's whole subtree reaches. The line continues through
// whichever correction is still being written; the one that stopped becomes
// the aside.
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

const lineFrom = (step: ThreadStep, reach: Map<number, number>): ThreadLine => {
  const [next, ...rest] = [...step.children].sort(
    (a, b) => (reach.get(b.id) ?? 0) - (reach.get(a.id) ?? 0) || a.at - b.at,
  );
  const tail: ThreadLine = next ? lineFrom(next, reach) : { steps: [], branches: [] };

  return {
    steps: [step, ...tail.steps],
    branches: [
      ...rest.map((other) => ({ after: 0, line: lineFrom(other, reach) })),
      ...tail.branches.map((branch) => ({ ...branch, after: branch.after + 1 })),
    ],
  };
};

export const straighten = (root: ThreadStep): ThreadLine => lineFrom(root, reachOf(root));

export const lengthOf = (line: ThreadLine): number =>
  line.steps.length + line.branches.reduce((total, b) => total + lengthOf(b.line), 0);
