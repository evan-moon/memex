import { describe, expect, it } from 'vitest';
import type { ThreadStep } from './api.ts';
import { lengthOf, straighten } from './thread-layout.ts';

const step = (id: number, at: number, children: ThreadStep[] = []): ThreadStep => ({
  id,
  title: `#${id}`,
  layer: 'past',
  at,
  children,
});

describe('straighten', () => {
  it('reads an unbroken chain as one line', () => {
    const line = straighten(step(1, 1, [step(2, 2, [step(3, 3)])]));

    expect(line.steps.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(line.branches).toEqual([]);
  });

  it('keeps the line on whichever direction is still being written', () => {
    const stopped = step(2, 2);
    const living = step(3, 3, [step(4, 9)]);
    const line = straighten(step(1, 1, [stopped, living]));

    expect(line.steps.map((s) => s.id)).toEqual([1, 3, 4]);
    expect(line.branches.map((b) => b.line.steps.map((s) => s.id))).toEqual([[2]]);
  });

  it('hangs a branch off the step it left', () => {
    const line = straighten(step(1, 1, [step(2, 2, [step(5, 5), step(6, 6, [step(7, 20)])])]));

    expect(line.steps.map((s) => s.id)).toEqual([1, 2, 6, 7]);
    expect(line.branches).toHaveLength(1);
    expect(line.branches[0].after).toBe(1);
    expect(line.branches[0].line.steps.map((s) => s.id)).toEqual([5]);
  });

  it('carries a branch that branched again', () => {
    const line = straighten(step(1, 1, [step(2, 2, [step(3, 3), step(4, 4)]), step(5, 30)]));

    expect(line.steps.map((s) => s.id)).toEqual([1, 5]);
    const aside = line.branches[0].line;
    expect(aside.steps.map((s) => s.id)).toEqual([2, 4]);
    expect(aside.branches[0].line.steps.map((s) => s.id)).toEqual([3]);
  });

  it('counts every step once, however it branched', () => {
    expect(lengthOf(straighten(step(1, 1, [step(2, 2), step(3, 3, [step(4, 4)])])))).toBe(4);
  });
});
