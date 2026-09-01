import type { NoteType } from './classify.ts';

export type CardField = 'section' | 'body' | 'heading' | 'title' | 'none';

export type CardQuality = 'good' | 'weak' | 'bad';

export type NoteCard = {
  line: string | null;
  field: CardField;
  quality: CardQuality;
};

export type CardInput = {
  title: string;
  content: string;
  type: NoteType;
};

const MAX_LENGTH = 160;
const MIN_PROSE_LENGTH = 20;

const SECTION_LABELS = [
  '한 줄',
  '결론',
  '요약',
  'Resume',
  'TL;DR',
  '무엇이 틀렸나',
  '지금 맞는 것',
  '오늘 한 작업',
];

const SKIP_PREFIX = /^(#|\||>|---|===|!\[|<)/;
const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;
const CHECKBOX = /^\[[ xX]\]\s*/;
const HTML_TAG = /<[^>]*>/g;
const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MD_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const EMPHASIS = /\*\*|__|`|~~/g;
const HEADING = /^#{1,6}\s+(.+?)\s*$/;
const H2 = /^##\s+(.+?)\s*$/;
const HEDGE = /^(이 노트|본 문서|아래는|다음은)/;
const RESIDUAL_TAG = /<[a-zA-Z/!][^>]*>/;

type Line = { text: string; heading: string | null };

const readable = (content: string): Line[] => {
  const body = content.startsWith('---')
    ? (() => {
        const end = content.indexOf('\n---', 3);
        return end === -1 ? content : content.slice(end + 4);
      })()
    : content;

  return body.split('\n').reduce<{ lines: Line[]; fenced: boolean }>(
    (acc, text) => {
      if (text.trimStart().startsWith('```')) return { ...acc, fenced: !acc.fenced };
      if (acc.fenced) return acc;
      const match = text.match(HEADING);
      return { ...acc, lines: [...acc.lines, { text, heading: match ? match[1] : null }] };
    },
    { lines: [], fenced: false },
  ).lines;
};

const clean = (raw: string): string =>
  raw
    .trim()
    .replace(LIST_MARKER, '')
    .replace(CHECKBOX, '')
    .replace(WIKI_LINK, (_, target: string, display?: string) => display ?? target)
    .replace(MD_LINK, (_, text: string) => text)
    .replace(HTML_TAG, '')
    .replace(EMPHASIS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);

const isSectionLabel = (heading: string): boolean =>
  SECTION_LABELS.some((label) => heading.trim().toLowerCase().startsWith(label.toLowerCase()));

const fromSection = (lines: Line[]): string | null => {
  const start = lines.findIndex((line) => line.heading !== null && isSectionLabel(line.heading));
  if (start === -1) return null;

  const next = lines.slice(start + 1).find((line) => line.text.trim().length > 0);
  if (!next || next.heading !== null) return null;

  const candidate = clean(next.text);
  return candidate.length > 0 ? candidate : null;
};

const fromBody = (lines: Line[]): string | null => {
  for (const line of lines) {
    const trimmed = line.text.trim();
    if (trimmed.length === 0 || SKIP_PREFIX.test(trimmed)) continue;
    const candidate = clean(trimmed);
    if (candidate.length >= MIN_PROSE_LENGTH) return candidate;
  }
  return null;
};

const firstH2 = (lines: Line[]): string | null => {
  const match = lines.map((line) => line.text.match(H2)).find((m) => m !== null);
  return match ? clean(match[1]) : null;
};

const pathish = (line: string): boolean =>
  !line.includes(' ') && (line.match(/\//g)?.length ?? 0) >= 4;

const judge = (line: string, title: string, field: CardField): CardQuality => {
  if (line.length === 0) return 'bad';
  if (field !== 'heading' && line.length < MIN_PROSE_LENGTH) return 'bad';
  if (line === title.trim()) return 'bad';
  if (RESIDUAL_TAG.test(line)) return 'bad';
  if (pathish(line)) return 'bad';
  if (HEDGE.test(line)) return 'weak';
  return 'good';
};

const NONE: NoteCard = { line: null, field: 'none', quality: 'bad' };

const manuscriptCard = (lines: Line[], title: string): NoteCard => {
  const heading = firstH2(lines);
  if (heading === null) return { line: clean(title), field: 'title', quality: 'weak' };
  return { line: heading, field: 'heading', quality: judge(heading, title, 'heading') };
};

export const extractCard = (input: CardInput): NoteCard => {
  const lines = readable(input.content);

  if (input.type === '책') return manuscriptCard(lines, input.title);

  const section = fromSection(lines);
  const sectionQuality = section === null ? 'bad' : judge(section, input.title, 'section');
  if (section !== null && sectionQuality !== 'bad') {
    return { line: section, field: 'section', quality: sectionQuality };
  }

  const body = fromBody(lines);
  if (body !== null) {
    return { line: body, field: 'body', quality: judge(body, input.title, 'body') };
  }

  if (section !== null) return { line: section, field: 'section', quality: sectionQuality };

  return NONE;
};
