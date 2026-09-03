import type { NoteLayer } from './schema.ts';

export const NOTE_TYPES = [
  '발행물',
  '책',
  '코드문서',
  '초안',
  '세션기록',
  '정정',
  '작업지시서',
  '규칙',
  '면접기록',
  '업무메모',
  '제품작업',
  '학습메모',
  '에세이',
  '미분류',
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export type NoteArea = '글' | '코드' | '작업' | '토스' | '내 제품' | '학습' | '기타';

export type ClassifyMethod =
  | 'declared'
  | 'path'
  | 'title'
  | 'heading'
  | 'layer'
  | 'tag'
  | 'category'
  | 'fallback';

export type Confidence = '강' | '약';

export type NoteTypeLabel = {
  type: NoteType;
  area: NoteArea;
  method: ClassifyMethod;
  confidence: Confidence;
};

export type ClassifyInput = {
  filePath: string;
  title: string;
  content: string;
  layer: NoteLayer;
  tags: readonly string[];
  category: string | null;
  declaredType: NoteType | null;
};

export const isNoteType = (value: unknown): value is NoteType =>
  typeof value === 'string' && (NOTE_TYPES as readonly string[]).includes(value);

const WEAK_METHODS: readonly ClassifyMethod[] = ['tag', 'category', 'fallback'];

const confidenceOf = (method: ClassifyMethod): Confidence =>
  WEAK_METHODS.includes(method) ? '약' : '강';

const WORK_TAGS = new Set([
  'toss',
  '토스',
  '1on1',
  'coaching',
  'coffee-chat',
  'hiring',
  'interview',
  'feedback',
  'f-lead',
  '채용',
  '조직',
  '팀',
]);

const PRODUCT_TAGS = new Set([
  'opula',
  'firma',
  'memex',
  'mcp',
  'wadiz',
  'claude-memory',
  'marketing',
  'strategy',
  'herald',
  'skope',
]);

const HANDOFF_TITLE = /세션 인계|핸드오프|handoff/i;
const INTERVIEW_TITLE = /면접|지원자|인터뷰 회고/;
const ESSAY_HEADING = /마치며|Wrapping Up|Closing/i;
const ESSAY_MIN_LENGTH = 3000;

export const headingsOf = (content: string): string[] =>
  content.split('\n').reduce<{ headings: string[]; fenced: boolean }>(
    (acc, line) => {
      if (line.trimStart().startsWith('```')) return { ...acc, fenced: !acc.fenced };
      if (acc.fenced) return acc;
      const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
      return match ? { ...acc, headings: [...acc.headings, match[1]] } : acc;
    },
    { headings: [], fenced: false },
  ).headings;

type Facts = {
  path: string;
  title: string;
  content: string;
  layer: NoteLayer;
  tags: Set<string>;
  category: string | null;
  headings: string[];
};

type Rule = {
  type: NoteType;
  area: NoteArea;
  method: ClassifyMethod;
  matches: (facts: Facts) => boolean;
};

const RULES: readonly Rule[] = [
  {
    type: '발행물',
    area: '글',
    method: 'path',
    matches: (f) => f.path.includes('evan-blog/content/posts'),
  },
  {
    type: '책',
    area: '글',
    method: 'path',
    matches: (f) => f.path.includes('evan-blog/content/books'),
  },
  {
    type: '코드문서',
    area: '코드',
    method: 'layer',
    matches: (f) => f.layer === 'external',
  },
  {
    type: '초안',
    area: '글',
    method: 'path',
    matches: (f) => f.path.includes('/writing/') || f.path.toLowerCase().includes('draft'),
  },
  {
    type: '세션기록',
    area: '작업',
    method: 'title',
    matches: (f) => HANDOFF_TITLE.test(f.title),
  },
  {
    type: '세션기록',
    area: '작업',
    method: 'heading',
    matches: (f) =>
      f.headings.some((h) => h.includes('Resume')) &&
      f.headings.some((h) => h.includes('다음 작업')),
  },
  {
    type: '정정',
    area: '작업',
    method: 'title',
    matches: (f) => f.title.startsWith('[Amendment') || f.title.startsWith('[정정'),
  },
  {
    type: '작업지시서',
    area: '작업',
    method: 'title',
    matches: (f) => f.title.includes('작업지시서'),
  },
  {
    type: '규칙',
    area: '작업',
    method: 'layer',
    matches: (f) => f.layer === 'rule',
  },
  {
    type: '면접기록',
    area: '토스',
    method: 'heading',
    matches: (f) => f.headings.some((h) => h.includes('이력 질문') || h.includes('과제 질문')),
  },
  {
    type: '면접기록',
    area: '토스',
    method: 'title',
    matches: (f) => INTERVIEW_TITLE.test(f.title),
  },
  {
    type: '업무메모',
    area: '토스',
    method: 'tag',
    matches: (f) => [...f.tags].some((tag) => WORK_TAGS.has(tag)),
  },
  {
    type: '제품작업',
    area: '내 제품',
    method: 'tag',
    matches: (f) => [...f.tags].some((tag) => PRODUCT_TAGS.has(tag)),
  },
  {
    type: '학습메모',
    area: '학습',
    method: 'category',
    matches: (f) => f.category === 'learning',
  },
  {
    type: '초안',
    area: '글',
    method: 'category',
    matches: (f) => f.category === 'content',
  },
  {
    type: '에세이',
    area: '글',
    method: 'heading',
    matches: (f) =>
      f.headings.some((h) => ESSAY_HEADING.test(h)) && f.content.length > ESSAY_MIN_LENGTH,
  },
];

const FALLBACK: NoteTypeLabel = {
  type: '미분류',
  area: '기타',
  method: 'fallback',
  confidence: '약',
};

const AREA_OF_DECLARED: Record<NoteType, NoteArea> = {
  발행물: '글',
  책: '글',
  코드문서: '코드',
  초안: '글',
  세션기록: '작업',
  정정: '작업',
  작업지시서: '작업',
  규칙: '작업',
  면접기록: '토스',
  업무메모: '토스',
  제품작업: '내 제품',
  학습메모: '학습',
  에세이: '글',
  미분류: '기타',
};

export const classifyNote = (input: ClassifyInput): NoteTypeLabel => {
  if (input.declaredType !== null) {
    return {
      type: input.declaredType,
      area: AREA_OF_DECLARED[input.declaredType],
      method: 'declared',
      confidence: '강',
    };
  }

  const facts: Facts = {
    path: input.filePath,
    title: input.title,
    content: input.content,
    layer: input.layer,
    tags: new Set(input.tags),
    category: input.category,
    headings: headingsOf(input.content),
  };

  const rule = RULES.find((r) => r.matches(facts));
  if (!rule) return FALLBACK;

  return {
    type: rule.type,
    area: rule.area,
    method: rule.method,
    confidence: confidenceOf(rule.method),
  };
};
