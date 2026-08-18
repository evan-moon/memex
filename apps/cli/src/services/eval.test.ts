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

  it('scores nDCG 1 when the only relevant note ranks first', () => {
    expect(scoreCase({ query: 'q', expect: [1] }, [1, 2, 3]).ndcg).toBeCloseTo(1);
  });

  it('discounts nDCG when a graded-relevant note outranks a better one', () => {
    const c = { query: 'q', expect: [1], graded: { 1: 2, 2: 1 } };
    expect(scoreCase(c, [2, 1]).ndcg).toBeLessThan(scoreCase(c, [1, 2]).ndcg);
  });

  it('counts every graded-relevant note in recall', () => {
    const c = { query: 'q', expect: [1], graded: { 1: 2, 2: 1, 3: 1 } };
    expect(scoreCase(c, [1, 2]).recall).toBeCloseTo(2 / 3);
  });
});

describe('summarize', () => {
  it('computes hit@1, hit@k, and MRR', () => {
    const cases = [
      scoreCase({ query: 'a', expect: [1] }, [1, 2, 3]),
      scoreCase({ query: 'b', expect: [2] }, [9, 2]),
      scoreCase({ query: 'c', expect: [3] }, [9, 8]),
    ];
    const s = summarize(cases);
    expect(s.hitAt1).toBeCloseTo(1 / 3);
    expect(s.hitAtK).toBeCloseTo(2 / 3);
    expect(s.mrr).toBeCloseTo((1 + 0.5 + 0) / 3);
  });

  it('honours k when deciding a hit', () => {
    const cases = [scoreCase({ query: 'a', expect: [1] }, [9, 8, 1])];
    expect(summarize(cases, 2).hitAtK).toBe(0);
    expect(summarize(cases, 3).hitAtK).toBe(1);
  });

  it('splits scores by answer position', () => {
    const cases = [
      scoreCase({ query: 'a', expect: [1], pos: 'head' }, [1]),
      scoreCase({ query: 'b', expect: [2], pos: 'tail' }, [9]),
      scoreCase({ query: 'c', expect: [3], pos: 'tail' }, [9]),
    ];
    const s = summarize(cases);
    expect(s.byPosition.head?.hitAt1).toBe(1);
    expect(s.byPosition.tail).toMatchObject({ n: 2, hitAt1: 0 });
    expect(s.byPosition.mid).toBeUndefined();
  });
});

describe('parseEvalFile', () => {
  it('parses valid cases', () => {
    const cases = parseEvalFile('[{"query":"q","expect":[1,2]}]');
    expect(cases).toEqual([{ query: 'q', expect: [1, 2] }]);
  });

  it('keeps position and graded relevance when present', () => {
    const cases = parseEvalFile('[{"query":"q","expect":[1],"pos":"tail","graded":{"1":2}}]');
    expect(cases[0]).toEqual({ query: 'q', expect: [1], pos: 'tail', graded: { 1: 2 } });
  });

  it('drops an unknown position instead of failing', () => {
    expect(parseEvalFile('[{"query":"q","expect":[1],"pos":"middle"}]')[0].pos).toBeUndefined();
  });

  it('rejects entries without expected ids', () => {
    expect(() => parseEvalFile('[{"query":"q","expect":[]}]')).toThrow(/expect/);
  });

  it('rejects malformed graded maps', () => {
    expect(() => parseEvalFile('[{"query":"q","expect":[1],"graded":[1,2]}]')).toThrow(/graded/);
  });

  it('rejects non-array files', () => {
    expect(() => parseEvalFile('{"query":"q"}')).toThrow(/array/);
  });
});
