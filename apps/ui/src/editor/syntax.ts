import { tags as t } from '@lezer/highlight';
import type { MarkdownConfig } from '@lezer/markdown';

// `[[Title]]` is memex's own syntax, so the markdown parser has to be taught it.
// Without a node of its own it arrives as two literal brackets and a run of text,
// which cannot be hidden, styled or clicked as one thing.
export const WikiLink: MarkdownConfig = {
  defineNodes: [
    { name: 'WikiLink', style: t.link },
    { name: 'WikiLinkMark', style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: 'WikiLink',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== 91 /* [ */ || cx.char(pos + 1) !== 91) return -1;
        const end = cx.slice(pos, cx.end).indexOf(']]');
        if (end < 0) return -1;
        const close = pos + end;
        return cx.addElement(
          cx.elt('WikiLink', pos, close + 2, [
            cx.elt('WikiLinkMark', pos, pos + 2),
            cx.elt('WikiLinkMark', close, close + 2),
          ]),
        );
      },
    },
  ],
};

// `[[Title|shown]]` links by title and reads as the second half.
export const wikiTarget = (inner: string) => inner.split('|')[0]?.trim() ?? inner;

// `#tag` is memex's other own syntax. The markdown parser has no node for it, so
// without this it arrives as a hash and a word and cannot be styled or clicked.
export const Tag: MarkdownConfig = {
  defineNodes: [{ name: 'Tag', style: t.tagName }],
  parseInline: [
    {
      name: 'Tag',
      parse(cx, next, pos) {
        if (next !== 35 /* # */) return -1;
        // A hash only opens a tag at a word boundary; `a#b` and a heading's own
        // `#` are not tags.
        const before = pos > cx.offset ? cx.slice(pos - 1, pos) : ' ';
        if (!/[\s([]/.test(before)) return -1;
        const found = /^[\w가-힣/_-]+/.exec(cx.slice(pos + 1, cx.end));
        if (found === null) return -1;
        return cx.addElement(cx.elt('Tag', pos, pos + 1 + found[0].length));
      },
    },
  ],
};
