import { describe, expect, it } from 'vitest';
import { type MdNode, remarkWikiLinks, splitWikiLinks, WIKI_TITLE_PROP } from './wiki-links.ts';

const text = (value: string): MdNode => ({ type: 'text', value });

const wiki = (title: string, display = title): MdNode => ({
  type: 'link',
  url: `wiki:${title}`,
  data: { hProperties: { [WIKI_TITLE_PROP]: title } },
  children: [text(display)],
});

describe('splitWikiLinks', () => {
  it('leaves plain text as one node', () => {
    expect(splitWikiLinks('링크 없는 문장')).toEqual([text('링크 없는 문장')]);
  });

  it('turns [[Title]] into a link keeping the text around it', () => {
    expect(splitWikiLinks('앞 [[memex]] 뒤')).toEqual([text('앞 '), wiki('memex'), text(' 뒤')]);
  });

  it('uses the display half of [[Title|display]] but links the title', () => {
    const [node] = splitWikiLinks('[[Obsidian 정합성 재편|그 재편]]');
    expect(node).toEqual(wiki('Obsidian 정합성 재편', '그 재편'));
  });

  it('handles several links in one line', () => {
    expect(splitWikiLinks('[[a]] and [[b]]').filter((n) => n.type === 'link')).toHaveLength(2);
  });

  it('carries the raw title as a hast property so URL encoding cannot break lookup', () => {
    const [node] = splitWikiLinks('[[모순 탐지 — 낡음 다음에 오는 것]]');
    expect(node.data?.hProperties?.[WIKI_TITLE_PROP]).toBe('모순 탐지 — 낡음 다음에 오는 것');
  });

  it('does not swallow a title containing brackets-free punctuation', () => {
    const [node] = splitWikiLinks('[[stats·frontmatter round-trip (2026-06-11)]]');
    expect(node.url).toBe('wiki:stats·frontmatter round-trip (2026-06-11)');
  });
});

describe('remarkWikiLinks', () => {
  it('rewrites text nodes but leaves code nodes alone', () => {
    const tree: MdNode = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [text('see [[memex]]')] },
        { type: 'code', value: 'const x = "[[not a link]]"' },
        { type: 'paragraph', children: [{ type: 'inlineCode', value: '[[also not]]' }] },
      ],
    };
    remarkWikiLinks()(tree);

    expect(tree.children?.[0].children?.[1]).toEqual(wiki('memex'));
    expect(tree.children?.[1].value).toBe('const x = "[[not a link]]"');
    expect(tree.children?.[2].children?.[0]).toEqual({ type: 'inlineCode', value: '[[also not]]' });
  });

  it('leaves an existing markdown link untouched', () => {
    const tree: MdNode = {
      type: 'root',
      children: [{ type: 'link', url: 'https://x.test', children: [text('[[looks like one]]')] }],
    };
    remarkWikiLinks()(tree);
    expect(tree.children?.[0].children?.[0]).toEqual(text('[[looks like one]]'));
  });
});
