import { describe, expect, it } from 'vitest';
import { collapseUnchanged, diffLines } from './diff.ts';

describe('diffLines', () => {
  it('marks nothing when the text is unchanged', () => {
    expect(diffLines('a\nb', 'a\nb').every((l) => l.kind === 'same')).toBe(true);
  });

  it('shows a replaced line as a removal and an addition', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('keeps common lines common instead of rewriting the whole block', () => {
    const out = diffLines('a\nb\nc\nd', 'a\nb\nX\nc\nd');
    expect(out.filter((l) => l.kind === 'add')).toEqual([{ kind: 'add', text: 'X' }]);
    expect(out.filter((l) => l.kind === 'remove')).toEqual([]);
  });

  it('handles an empty side', () => {
    expect(diffLines('', 'a').filter((l) => l.kind === 'add')).toHaveLength(1);
  });
});

describe('collapseUnchanged', () => {
  it('collapses a long untouched run and keeps context around a change', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 10', 'line TEN');
    const out = collapseUnchanged(diffLines(before, after));

    expect(out.some((l) => l.kind === 'skip')).toBe(true);
    expect(out.filter((l) => l.kind === 'same')).toHaveLength(4);
    expect(out.filter((l) => l.kind === 'add' || l.kind === 'remove')).toHaveLength(2);
  });

  it('collapses nothing when everything changed', () => {
    const out = collapseUnchanged(diffLines('a\nb', 'x\ny'));
    expect(out.some((l) => l.kind === 'skip')).toBe(false);
  });
});
