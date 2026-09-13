import type { CompletionSource } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';

export type SlashCommand = {
  id: string;
  label: string;
  detail: string;
  keywords: string[];
  insert: string;
};

const commands: SlashCommand[] = [
  {
    id: 'text',
    label: '텍스트',
    detail: '일반 문단',
    keywords: ['text', 'paragraph', '문단'],
    insert: '',
  },
  {
    id: 'heading-1',
    label: '제목 1',
    detail: '가장 큰 제목',
    keywords: ['heading 1', 'h1', 'title', '제목'],
    insert: '# ',
  },
  {
    id: 'heading-2',
    label: '제목 2',
    detail: '중간 제목',
    keywords: ['heading 2', 'h2', 'subtitle', '제목'],
    insert: '## ',
  },
  {
    id: 'heading-3',
    label: '제목 3',
    detail: '작은 제목',
    keywords: ['heading 3', 'h3', '제목'],
    insert: '### ',
  },
  {
    id: 'bullet-list',
    label: '글머리 기호 목록',
    detail: '순서 없는 목록',
    keywords: ['bullet', 'unordered', 'list', '목록'],
    insert: '- ',
  },
  {
    id: 'number-list',
    label: '번호 매기기 목록',
    detail: '순서가 있는 목록',
    keywords: ['number', 'ordered', 'list', '목록'],
    insert: '1. ',
  },
  {
    id: 'check-list',
    label: '할 일 목록',
    detail: '체크할 수 있는 항목',
    keywords: ['check', 'todo', 'task', 'checkbox', '할 일', '체크'],
    insert: '- [ ] ',
  },
  {
    id: 'quote',
    label: '인용',
    detail: '인용문',
    keywords: ['quote', 'blockquote', '인용'],
    insert: '> ',
  },
  {
    id: 'divider',
    label: '구분선',
    detail: '문단 사이 구분',
    keywords: ['divider', 'rule', 'separator', '구분선'],
    insert: '---',
  },
  {
    id: 'code',
    label: '코드',
    detail: '코드 블록',
    keywords: ['code', 'fence', '코드'],
    insert: '```\n\n```',
  },
  {
    id: 'table',
    label: '표',
    detail: '2열 표',
    keywords: ['table', 'grid', '표'],
    insert: '| 열 1 | 열 2 |\n| --- | --- |\n|  |  |',
  },
];

const normalized = (value: string) => value.trim().toLocaleLowerCase();

export const parseSlashInput = (beforeCursor: string): { from: number; query: string } | null => {
  const match = /^([ \t]*)\/([^/\s]*)$/u.exec(beforeCursor);
  if (match === null) return null;
  return { from: match[1].length, query: match[2] };
};

export const slashCommandsFor = (query: string): SlashCommand[] => {
  const wanted = normalized(query);
  if (wanted === '') return commands;
  return commands.filter(({ label, keywords }) =>
    [label, ...keywords].some((word) => normalized(word).includes(wanted)),
  );
};

type SyntaxNodeLike = { name: string; parent: SyntaxNodeLike | null };

const hasCodeParent = (node: SyntaxNodeLike | null): boolean => {
  if (node === null) return false;
  if (/Code/.test(node.name)) return true;
  return hasCodeParent(node.parent);
};

const inCode = (context: Parameters<CompletionSource>[0]) => {
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  return hasCodeParent(node);
};

export const slashCompletion: CompletionSource = (context) => {
  if (inCode(context)) return null;
  const line = context.state.doc.lineAt(context.pos);
  const input = parseSlashInput(context.state.sliceDoc(line.from, context.pos));
  if (input === null) return null;

  return {
    from: line.from + input.from,
    filter: false,
    options: slashCommandsFor(input.query).map(({ label, detail, keywords, insert }) => ({
      label: [label, ...keywords].join(' '),
      displayLabel: label,
      detail,
      type: 'keyword',
      apply: insert,
    })),
  };
};
