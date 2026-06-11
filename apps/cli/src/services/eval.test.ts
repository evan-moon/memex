import { describe, expect, it } from 'vitest';
import { parseEvalFile, scoreCase, summarize } from './eval.ts';

describe('scoreCase', () => {
  it('reports the 1-based rank of the first expected id', () => {
    const r = scoreCase({ query: 'q', expect: [7, 9] }, [3, 9, 7]);
    expect(r.rank).toBe(2);
  });

  it('reports null when no expected id is returned', () => {
    expect(scoreCase({ query: 'q', expect: [7] }, [1, 2, 3]).rank).toBeNull();
  });
});

describe('summarize', () => {
  it('computes hit@1, hit@5, and MRR', () => {
    const cases = [
      scoreCase({ query: 'a', expect: [1] }, [1, 2, 3]), // rank 1
      scoreCase({ query: 'b', expect: [2] }, [9, 2]), // rank 2
      scoreCase({ query: 'c', expect: [3] }, [9, 8]), // miss
    ];
    const s = summarize(cases);
    expect(s.hitAt1).toBeCloseTo(1 / 3);
    expect(s.hitAt5).toBeCloseTo(2 / 3);
    expect(s.mrr).toBeCloseTo((1 + 0.5 + 0) / 3);
  });
});

describe('parseEvalFile', () => {
  it('parses valid cases', () => {
    const cases = parseEvalFile('[{"query":"q","expect":[1,2]}]');
    expect(cases).toEqual([{ query: 'q', expect: [1, 2] }]);
  });

  it('rejects entries without expected ids', () => {
    expect(() => parseEvalFile('[{"query":"q","expect":[]}]')).toThrow(/expect/);
  });

  it('rejects non-array files', () => {
    expect(() => parseEvalFile('{"query":"q"}')).toThrow(/array/);
  });
});
