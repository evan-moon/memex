import { describe, expect, it } from 'vitest';
import type { ThreadStep } from './api.ts';
import { layoutThread } from './thread-layout.ts';

const step = (id: number, at: number, children: ThreadStep[] = []): ThreadStep => ({
  id,
  title: `#${id}`,
  layer: 'past',
  at,
  children,
});

describe('layoutThread', () => {
  it('keeps an unbroken chain in one lane', () => {
    const { steps, lanes } = layoutThread(step(1, 1, [step(2, 2, [step(3, 3)])]));

    expect(lanes).toBe(1);
    expect(steps.map((s) => [s.id, s.row, s.lane])).toEqual([
      [1, 0, 0],
      [2, 1, 0],
      [3, 2, 0],
    ]);
  });

  it('runs the trunk through whichever branch is still being written', () => {
    const short = step(2, 2);
    const long = step(3, 3, [step(4, 9)]);
    const { steps } = layoutThread(step(1, 1, [short, long]));

    const trunk = steps.filter((s) => s.trunk).map((s) => s.id);
    expect(trunk).toEqual([1, 3, 4]);
    expect(steps.find((s) => s.id === 2)?.lane).toBe(1);
    expect(steps.find((s) => s.id === 3)?.lane).toBe(0);
  });

  it('gives the branch that leaves the trunk its own lane and keeps it there', () => {
    const branch = step(2, 2, [step(5, 5)]);
    const { steps, lanes } = layoutThread(step(1, 1, [branch, step(3, 3, [step(4, 9)])]));

    expect(lanes).toBe(2);
    expect(steps.find((s) => s.id === 2)?.lane).toBe(1);
    expect(steps.find((s) => s.id === 5)?.lane).toBe(1);
  });

  it('marks the step two corrections came off', () => {
    const { steps } = layoutThread(step(1, 1, [step(2, 2), step(3, 3)]));

    expect(steps.find((s) => s.id === 1)?.forks).toBe(true);
    expect(steps.find((s) => s.id === 2)?.forks).toBe(false);
  });

  it('never puts a correction above what it corrects', () => {
    const { steps } = layoutThread(step(1, 5, [step(2, 1)]));

    const rows = new Map(steps.map((s) => [s.id, s.row]));
    expect(rows.get(2)).toBeGreaterThan(rows.get(1) ?? 0);
  });

  it('draws one edge per correction', () => {
    const { edges } = layoutThread(step(1, 1, [step(2, 2), step(3, 3)]));

    expect(edges.map((e) => [e.from.id, e.to.id])).toEqual([
      [1, 2],
      [1, 3],
    ]);
  });
});
