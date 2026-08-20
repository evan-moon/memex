import { describe, expect, it } from 'vitest';
import { findTagVariants, rewriteTags, tagKey } from './tags.ts';

describe('tagKey', () => {
  it('sees through case, hyphen, underscore and spacing', () => {
    const same = ['Functional Programming', 'functional-programming', 'functional_programming'];
    expect(new Set(same.map(tagKey)).size).toBe(1);
  });

  it('keeps genuinely different tags apart', () => {
    expect(tagKey('coaching')).not.toBe(tagKey('toss'));
    expect(tagKey('toss')).not.toBe(tagKey('토스'));
  });
});

describe('findTagVariants', () => {
  it('keeps the spelling already used most and folds the rest into it', () => {
    const [variant] = findTagVariants(
      new Map([
        ['opula', 412],
        ['Opula', 2],
      ]),
    );
    expect(variant.keep).toBe('opula');
    expect(variant.drop).toEqual([{ tag: 'Opula', count: 2 }]);
    expect(variant.notes).toBe(2);
  });

  it('proposes nothing when every tag is spelled one way', () => {
    expect(
      findTagVariants(
        new Map([
          ['a', 3],
          ['b', 2],
        ]),
      ),
    ).toEqual([]);
  });

  it('leads with the group that touches the most notes', () => {
    const variants = findTagVariants(
      new Map([
        ['a', 10],
        ['A', 1],
        ['b', 10],
        ['B', 9],
      ]),
    );
    expect(variants[0].keep).toBe('b');
  });
});

describe('rewriteTags', () => {
  const rename = new Map([
    ['MCP', 'mcp'],
    ['TypeScript', 'typescript'],
  ]);

  it('rewrites an inline list in place', () => {
    const out = rewriteTags('---\ntitle: T\ntags: [MCP, LLM, TypeScript]\n---\n\nbody', rename);
    expect(out).toContain('tags: [mcp, LLM, typescript]');
    expect(out).toContain('body');
  });

  it('rewrites a block list and keeps its indentation', () => {
    const out = rewriteTags('---\ntags:\n  - MCP\n  - LLM\n---\n\nbody', rename);
    expect(out).toContain('  - mcp');
    expect(out).toContain('  - LLM');
  });

  it('collapses a tag that now duplicates one already there', () => {
    const out = rewriteTags('---\ntags: [MCP, mcp, LLM]\n---\n', rename);
    expect(out).toContain('tags: [mcp, LLM]');
  });

  it('leaves a note with no tags exactly as it was', () => {
    const note = '---\ntitle: T\n---\n\nbody';
    expect(rewriteTags(note, rename)).toBe(note);
  });

  it('touches nothing outside the frontmatter', () => {
    const note = '---\ntags: [MCP]\n---\n\n본문에 tags: [MCP] 라고 적혀 있어도 그대로';
    expect(rewriteTags(note, rename)).toContain('본문에 tags: [MCP] 라고');
  });

  it('leaves a tags: line outside the frontmatter alone', () => {
    const content = [
      '---',
      'title: yaml 예제',
      'tags: [mcp]',
      '---',
      '',
      '```yaml',
      'tags: [MCP, javascript]',
      '```',
      '',
    ].join('\n');
    const out = rewriteTags(
      content,
      new Map([
        ['MCP', 'mcp'],
        ['javascript', 'JavaScript'],
      ]),
    );
    expect(out).toContain('tags: [MCP, javascript]');
    expect(out.split('---')[1]).toContain('tags: [mcp]');
  });

  it('touches nothing in a note that has no frontmatter', () => {
    const content = 'tags: [MCP]\n\n본문\n';
    expect(rewriteTags(content, new Map([['MCP', 'mcp']]))).toBe(content);
  });

  it('keeps the body byte-identical when only tags change', () => {
    const body = '\n# 제목\n\n본문에 --- 구분선도 있고\n\ntags: 라는 말도 나온다\n';
    const out = rewriteTags(`---\ntags: [MCP]\n---${body}`, new Map([['MCP', 'mcp']]));
    expect(out).toBe(`---\ntags: [mcp]\n---${body}`);
  });
});
