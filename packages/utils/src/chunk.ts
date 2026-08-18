import { stripFrontmatter } from './format.ts';

export type NoteChunk = {
  ord: number;
  heading: string | null;
  text: string;
  excerpt: string;
  startChar: number;
  endChar: number;
};

export type ChunkOptions = {
  targetTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
};

const DEFAULTS = { targetTokens: 340, maxTokens: 420, overlapTokens: 70 } as const;

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ]/;
const WORDY = /[a-zA-Z \t]/;

export const estimateTokens = (text: string): number =>
  Math.ceil(
    [...text].reduce((acc, ch) => {
      if (HANGUL.test(ch)) return acc + 0.72;
      if (CJK.test(ch)) return acc + 1;
      if (WORDY.test(ch)) return acc + 0.25;
      return acc + 0.55;
    }, 0),
  );

const SENTENCE_BREAK = /(?<=[.!?。]\s)|(?<=다\.)|(?<=\n)/;

const splitSentences = (text: string): string[] =>
  text.split(SENTENCE_BREAK).filter((part) => part.length > 0);

const headingOf = (line: string): string | null => {
  const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
  return match ? match[1] : null;
};

type Line = { text: string; start: number; heading: string | null; fenced: boolean };

const annotate = (body: string): Line[] =>
  body.split('\n').reduce<{ lines: Line[]; offset: number; fenced: boolean }>(
    (acc, text) => {
      const opensOrCloses = text.trimStart().startsWith('```');
      const fenced = opensOrCloses ? !acc.fenced : acc.fenced;
      const inside = acc.fenced || fenced;
      return {
        lines: [
          ...acc.lines,
          { text, start: acc.offset, heading: inside ? null : headingOf(text), fenced: inside },
        ],
        offset: acc.offset + text.length + 1,
        fenced,
      };
    },
    { lines: [], offset: 0, fenced: false },
  ).lines;

type Block = { text: string; heading: string | null; start: number };

type Grouping = { blocks: Block[]; buf: Line[]; heading: string | null };

const flushed = (acc: Grouping): Block[] =>
  acc.buf.length === 0
    ? acc.blocks
    : [
        ...acc.blocks,
        {
          text: acc.buf.map((line) => line.text).join('\n'),
          heading: acc.heading,
          start: acc.buf[0].start,
        },
      ];

const toBlocks = (body: string): Block[] => {
  const grouped = annotate(body).reduce<Grouping>(
    (acc, line) => {
      if (line.heading !== null) return { blocks: flushed(acc), buf: [], heading: line.heading };
      if (line.text.trim() === '' && !line.fenced) return { ...acc, blocks: flushed(acc), buf: [] };
      return { ...acc, buf: [...acc.buf, line] };
    },
    { blocks: [], buf: [], heading: null },
  );
  return flushed(grouped);
};

const splitOversized = (block: Block, maxTokens: number): Block[] => {
  if (estimateTokens(block.text) <= maxTokens) return [block];
  const packed = splitSentences(block.text).reduce<{ out: Block[]; buf: string; start: number }>(
    (acc, sentence) => {
      const next = acc.buf + sentence;
      if (acc.buf.length > 0 && estimateTokens(next) > maxTokens) {
        return {
          out: [...acc.out, { text: acc.buf, heading: block.heading, start: acc.start }],
          buf: sentence,
          start: acc.start + acc.buf.length,
        };
      }
      return { ...acc, buf: next };
    },
    { out: [], buf: '', start: block.start },
  );
  return packed.buf.length > 0
    ? [...packed.out, { text: packed.buf, heading: block.heading, start: packed.start }]
    : packed.out;
};

const tailOverlap = (text: string, overlapTokens: number): string => {
  if (overlapTokens <= 0) return '';
  const picked = splitSentences(text).reduceRight<string[]>(
    (acc, sentence) =>
      estimateTokens([sentence, ...acc].join('')) <= overlapTokens ? [sentence, ...acc] : acc,
    [],
  );
  return picked.join('').trimStart();
};

type Packing = { out: Block[]; buf: string; heading: string | null; start: number };

const pack = (
  blocks: Block[],
  targetTokens: number,
  maxTokens: number,
  overlapTokens: number,
): Block[] => {
  const packed = blocks.reduce<Packing>(
    (acc, block) => {
      if (acc.buf.length === 0) {
        return { out: acc.out, buf: block.text, heading: block.heading, start: block.start };
      }
      const joined = `${acc.buf}\n\n${block.text}`;
      const sameSection = block.heading === acc.heading;
      if (sameSection && estimateTokens(joined) <= targetTokens) {
        return { ...acc, buf: joined };
      }
      const overlap = sameSection ? tailOverlap(acc.buf, overlapTokens) : '';
      const seeded = overlap.length > 0 ? `${overlap}\n\n${block.text}` : block.text;
      return {
        out: [...acc.out, { text: acc.buf, heading: acc.heading, start: acc.start }],
        buf: estimateTokens(seeded) <= maxTokens ? seeded : block.text,
        heading: block.heading,
        start: block.start,
      };
    },
    { out: [], buf: '', heading: null, start: 0 },
  );
  return packed.buf.length > 0
    ? [...packed.out, { text: packed.buf, heading: packed.heading, start: packed.start }]
    : packed.out;
};

export const buildChunkText = (
  title: string,
  heading: string | null,
  excerpt: string,
  folder?: string,
  tags?: string[],
): string => {
  const prefix = folder ? `[${folder}] ` : '';
  const path = heading && heading !== title ? `${title} > ${heading}` : title;
  const tagLine = tags && tags.length > 0 ? `\ntags: ${tags.join(', ')}` : '';
  return `${prefix}${path}${tagLine}\n\n${excerpt}`;
};

export const chunkNote = (
  params: { title: string; content: string; folder?: string; tags?: string[] },
  options: ChunkOptions = {},
): NoteChunk[] => {
  const body = stripFrontmatter(params.content).trim();
  const blocks = toBlocks(body);
  const longestHeading = blocks.reduce<string | null>(
    (acc, block) =>
      (block.heading?.length ?? 0) > (acc?.length ?? 0) ? (block.heading ?? acc) : acc,
    null,
  );
  const reserved = estimateTokens(
    buildChunkText(params.title, longestHeading, '', params.folder, params.tags),
  );
  const targetTokens = Math.max(80, (options.targetTokens ?? DEFAULTS.targetTokens) - reserved);
  const maxTokens = Math.max(120, (options.maxTokens ?? DEFAULTS.maxTokens) - reserved);
  const overlapTokens = options.overlapTokens ?? DEFAULTS.overlapTokens;

  const packed = pack(
    blocks.flatMap((block) => splitOversized(block, maxTokens)),
    targetTokens,
    maxTokens,
    overlapTokens,
  ).filter((block) => block.text.trim().length > 0);
  const sections = packed.length > 0 ? packed : [{ text: '', heading: null, start: 0 }];

  return sections.map((block, ord) => ({
    ord,
    heading: block.heading,
    text: buildChunkText(params.title, block.heading, block.text, params.folder, params.tags),
    excerpt: block.text,
    startChar: block.start,
    endChar: block.start + block.text.length,
  }));
};
