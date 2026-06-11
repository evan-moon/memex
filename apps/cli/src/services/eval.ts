// Golden-query evaluation: the fixed yardstick every retrieval change is
// measured against (RRF weights, new arms, embedding model swaps). Pure
// metric logic lives here so it is testable without an embedder.

export type EvalCase = {
  query: string;
  /** Note ids that count as a correct answer (any one of them). */
  expect: number[];
};

export type CaseResult = {
  query: string;
  expect: number[];
  got: number[];
  /** 1-based rank of the first expected id in got, or null when missed. */
  rank: number | null;
};

export type EvalSummary = {
  cases: CaseResult[];
  hitAt1: number;
  hitAt5: number;
  mrr: number;
};

export const scoreCase = (c: EvalCase, got: number[]): CaseResult => {
  const expected = new Set(c.expect);
  const idx = got.findIndex((id) => expected.has(id));
  return { query: c.query, expect: c.expect, got, rank: idx === -1 ? null : idx + 1 };
};

export const summarize = (cases: CaseResult[]): EvalSummary => {
  const n = cases.length || 1;
  const hitAt1 = cases.filter((c) => c.rank === 1).length / n;
  const hitAt5 = cases.filter((c) => c.rank !== null && c.rank <= 5).length / n;
  const mrr = cases.reduce((acc, c) => acc + (c.rank === null ? 0 : 1 / c.rank), 0) / n;
  return { cases, hitAt1, hitAt5, mrr };
};

export const parseEvalFile = (raw: string): EvalCase[] => {
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data)) throw new Error('eval file must be a JSON array');
  return data.map((entry, i) => {
    const e = entry as { query?: unknown; expect?: unknown };
    if (typeof e.query !== 'string' || e.query.length === 0) {
      throw new Error(`case ${i}: "query" must be a non-empty string`);
    }
    if (!Array.isArray(e.expect) || e.expect.length === 0 || !e.expect.every(Number.isInteger)) {
      throw new Error(`case ${i}: "expect" must be a non-empty array of note ids`);
    }
    return { query: e.query, expect: e.expect as number[] };
  });
};

export const EVAL_TEMPLATE = `[
  { "query": "example: what did we decide about auth", "expect": [123] },
  { "query": "예시: 추론 엔진 설계", "expect": [456, 457] }
]
`;
