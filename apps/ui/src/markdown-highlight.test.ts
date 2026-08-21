import { describe, expect, it } from 'vitest';
import { highlight } from './markdown-highlight.ts';

const kinds = (source: string) => highlight(source).map((line) => line.kind);
const pieces = (source: string) => highlight(source)[0].pieces;

describe('highlight', () => {
  it('separates the hashes from what the heading says', () => {
    expect(pieces('## 배경')).toEqual([
      { text: '## ', kind: 'marker' },
      { text: '배경', kind: 'plain' },
    ]);
  });

  it('keeps a list marker apart from the item', () => {
    expect(pieces('- 첫 항목')).toEqual([
      { text: '- ', kind: 'marker' },
      { text: '첫 항목', kind: 'plain' },
    ]);
  });

  it('marks a wiki link, which is the one that has to be right', () => {
    expect(pieces('see [[Some Note]] there')).toEqual([
      { text: 'see ', kind: 'plain' },
      { text: '[[Some Note]]', kind: 'wiki' },
      { text: ' there', kind: 'plain' },
    ]);
  });

  it('takes whichever inline span comes first, not whichever rule is first', () => {
    expect(pieces('**bold** and `code`').map((p) => p.kind)).toEqual(['strong', 'plain', 'code']);
  });

  it('stops highlighting inside a fenced block', () => {
    expect(kinds('```ts\n# not a heading\n```\n# a heading')).toEqual([
      'fence',
      'code',
      'fence',
      'heading',
    ]);
  });

  it('tells a horizontal rule from a heading', () => {
    expect(kinds('---\n# title')).toEqual(['rule', 'heading']);
  });

  it('leaves an empty line as an empty line', () => {
    expect(highlight('a\n\nb').map((l) => l.pieces.length)).toEqual([1, 0, 1]);
  });
});
