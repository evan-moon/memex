export const EVAL_POSITIONS = ['head', 'mid', 'tail'] as const;

export type EvalPosition = (typeof EVAL_POSITIONS)[number];

export type EvalCase = {
  query: string;
  /** Note ids that count as a correct answer (any one of them). */
  expect: number[];
  /** Where in the expected note the answer lives — splits scores by depth. */
  pos?: EvalPosition;
  /** Note id → relevance 0..2, filled in by grading. Falls back to expect. */
  graded?: Record<number, number>;
};

export type CaseResult = {
  query: string;
  expect: number[];
  got: number[];
  pos?: EvalPosition;
  /** 1-based rank of the first expected id in got, or null when missed. */
  rank: number | null;
  ndcg: number;
  recall: number;
};

export type PositionSummary = {
  n: number;
  hitAt1: number;
  hitAtK: number;
  mrr: number;
  ndcg: number;
};

export type EvalSummary = {
  cases: CaseResult[];
  hitAt1: number;
  hitAtK: number;
  mrr: number;
  ndcg: number;
  recall: number;
  byPosition: Partial<Record<EvalPosition, PositionSummary>>;
};

const relevanceOf = (c: EvalCase, id: number): number => {
  const graded = c.graded?.[id];
  if (typeof graded === 'number') return graded;
  return c.expect.includes(id) ? 1 : 0;
};

const discountedGain = (relevances: number[]): number =>
  relevances.reduce((acc, rel, i) => acc + (2 ** rel - 1) / Math.log2(i + 2), 0);

const knownRelevant = (c: EvalCase): number[] => {
  const fromGraded = Object.entries(c.graded ?? {}).map(([id, rel]) => ({ id: Number(id), rel }));
  const fromExpect = c.expect.map((id) => ({ id, rel: relevanceOf(c, id) }));
  const merged = [...fromGraded, ...fromExpect].reduce<Record<number, number>>(
    (acc, { id, rel }) => ({ ...acc, [id]: Math.max(acc[id] ?? 0, rel) }),
    {},
  );
  return Object.values(merged).filter((rel) => rel > 0);
};

export const scoreCase = (c: EvalCase, got: number[]): CaseResult => {
  const expected = new Set(c.expect);
  const idx = got.findIndex((id) => expected.has(id));
  const gains = got.map((id) => relevanceOf(c, id));
  const ideal = knownRelevant(c).sort((a, b) => b - a);
  const idcg = discountedGain(ideal.slice(0, got.length));
  const found = got.filter((id) => relevanceOf(c, id) > 0).length;
  return {
    query: c.query,
    expect: c.expect,
    got,
    pos: c.pos,
    rank: idx === -1 ? null : idx + 1,
    ndcg: idcg === 0 ? 0 : discountedGain(gains) / idcg,
    recall: ideal.length === 0 ? 0 : found / ideal.length,
  };
};

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

const summarizeGroup = (cases: CaseResult[], k: number): PositionSummary => ({
  n: cases.length,
  hitAt1: mean(cases.map((c) => (c.rank === 1 ? 1 : 0))),
  hitAtK: mean(cases.map((c) => (c.rank !== null && c.rank <= k ? 1 : 0))),
  mrr: mean(cases.map((c) => (c.rank === null ? 0 : 1 / c.rank))),
  ndcg: mean(cases.map((c) => c.ndcg)),
});

export const summarize = (cases: CaseResult[], k = 5): EvalSummary => {
  const overall = summarizeGroup(cases, k);
  const byPosition = EVAL_POSITIONS.reduce<Partial<Record<EvalPosition, PositionSummary>>>(
    (acc, pos) => {
      const group = cases.filter((c) => c.pos === pos);
      return group.length === 0 ? acc : { ...acc, [pos]: summarizeGroup(group, k) };
    },
    {},
  );
  return {
    cases,
    hitAt1: overall.hitAt1,
    hitAtK: overall.hitAtK,
    mrr: overall.mrr,
    ndcg: overall.ndcg,
    recall: mean(cases.map((c) => c.recall)),
    byPosition,
  };
};

const isPosition = (value: unknown): value is EvalPosition =>
  EVAL_POSITIONS.some((pos) => pos === value);

const isNoteIdList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.every((id) => Number.isInteger(id));

const parseGraded = (value: unknown, index: number): Record<number, number> | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`case ${index}: "graded" must be an object of note id → relevance`);
  }
  return Object.entries(value).reduce<Record<number, number>>((acc, [id, rel]) => {
    if (!Number.isInteger(Number(id)) || typeof rel !== 'number') {
      throw new Error(`case ${index}: "graded" entries must be noteId: number`);
    }
    return { ...acc, [Number(id)]: rel };
  }, {});
};

export const parseEvalFile = (raw: string): EvalCase[] => {
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data)) throw new Error('eval file must be a JSON array');
  return data.map((entry, i) => {
    const e = entry as { query?: unknown; expect?: unknown; pos?: unknown; graded?: unknown };
    if (typeof e.query !== 'string' || e.query.length === 0) {
      throw new Error(`case ${i}: "query" must be a non-empty string`);
    }
    if (!isNoteIdList(e.expect)) {
      throw new Error(`case ${i}: "expect" must be a non-empty array of note ids`);
    }
    const graded = parseGraded(e.graded, i);
    return {
      query: e.query,
      expect: e.expect,
      ...(isPosition(e.pos) ? { pos: e.pos } : {}),
      ...(graded ? { graded } : {}),
    };
  });
};

export const EVAL_TEMPLATE = `[
  { "query": "example: what did we decide about auth", "expect": [123], "pos": "head" },
  { "query": "예시: 추론 엔진 설계", "expect": [456, 457], "pos": "tail" }
]
`;
