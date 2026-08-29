export type InlineKind = 'plain' | 'code' | 'wiki' | 'strong' | 'link' | 'marker';

export type LineKind = 'text' | 'heading' | 'quote' | 'fence' | 'code' | 'rule';

export type Piece = { text: string; kind: InlineKind };

export type Line = { kind: LineKind; pieces: Piece[] };

const HEADING = /^(#{1,6})\s/;
const QUOTE = /^\s*>/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(```|~~~)/;
const BULLET = /^(\s*(?:[-*+]|\d+\.)\s+)/;

// Inline spans, in the order they are tried. Markdown nests, but a person
// editing a note wants to see structure, not a parse tree — so the first match
// wins and the rest of the line is scanned after it.
const INLINE: { kind: InlineKind; pattern: RegExp }[] = [
  { kind: 'code', pattern: /`[^`\n]+`/ },
  { kind: 'wiki', pattern: /\[\[[^\]\n]+\]\]/ },
  { kind: 'link', pattern: /\[[^\]\n]*\]\([^)\n]*\)/ },
  { kind: 'strong', pattern: /\*\*[^*\n]+\*\*/ },
];

const firstMatch = (text: string) =>
  INLINE.reduce<{ kind: InlineKind; at: number; length: number } | null>(
    (best, { kind, pattern }) => {
      const found = pattern.exec(text);
      if (!found) return best;
      const at = found.index;
      return best === null || at < best.at ? { kind, at, length: found[0].length } : best;
    },
    null,
  );

const inlinePieces = (text: string): Piece[] => {
  if (text.length === 0) return [];
  const found = firstMatch(text);
  if (!found) return [{ text, kind: 'plain' }];

  const before = text.slice(0, found.at);
  const matched = text.slice(found.at, found.at + found.length);
  const after = text.slice(found.at + found.length);
  return [
    ...(before.length > 0 ? [{ text: before, kind: 'plain' as const }] : []),
    { text: matched, kind: found.kind },
    ...inlinePieces(after),
  ];
};

const bodyPieces = (text: string): Piece[] => {
  const bullet = BULLET.exec(text);
  return bullet
    ? [{ text: bullet[1], kind: 'marker' }, ...inlinePieces(text.slice(bullet[1].length))]
    : inlinePieces(text);
};

const lineOf = (text: string, inFence: boolean): Line => {
  if (FENCE.test(text)) return { kind: 'fence', pieces: [{ text, kind: 'plain' }] };
  if (inFence) return { kind: 'code', pieces: [{ text, kind: 'plain' }] };
  if (RULE.test(text)) return { kind: 'rule', pieces: [{ text, kind: 'plain' }] };

  const heading = HEADING.exec(text);
  if (heading) {
    return {
      kind: 'heading',
      pieces: [
        { text: heading[0], kind: 'marker' },
        ...inlinePieces(text.slice(heading[0].length)),
      ],
    };
  }
  if (QUOTE.test(text)) return { kind: 'quote', pieces: bodyPieces(text) };
  return { kind: 'text', pieces: bodyPieces(text) };
};

export const highlight = (source: string): Line[] =>
  source.split('\n').reduce<{ lines: Line[]; inFence: boolean }>(
    (acc, text) => {
      const line = lineOf(text, acc.inFence);
      return {
        lines: [...acc.lines, line],
        inFence: line.kind === 'fence' ? !acc.inFence : acc.inFence,
      };
    },
    { lines: [], inFence: false },
  ).lines;
