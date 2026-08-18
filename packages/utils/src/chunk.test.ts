import { describe, expect, it } from 'vitest';
import { buildChunkText, chunkNote, estimateTokens } from './chunk.ts';

const korean = (n: number) => '한국어 문장을 반복해서 길이를 만든다. '.repeat(n);

describe('estimateTokens', () => {
  it('charges Korean syllables more than latin characters', () => {
    expect(estimateTokens('가나다라마')).toBeGreaterThan(estimateTokens('abcde'));
  });

  it('grows with length', () => {
    expect(estimateTokens(korean(10))).toBeGreaterThan(estimateTokens(korean(1)));
  });
});

describe('chunkNote', () => {
  it('keeps a short note as a single chunk', () => {
    const chunks = chunkNote({ title: 'T', content: 'one paragraph only' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].excerpt).toBe('one paragraph only');
  });

  it('always produces at least one chunk, even for an empty note', () => {
    expect(chunkNote({ title: 'T', content: '' })).toHaveLength(1);
  });

  it('splits a long note into several chunks', () => {
    const chunks = chunkNote({ title: 'T', content: korean(200) });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('keeps every chunk under the token ceiling', () => {
    const chunks = chunkNote({ title: 'T', content: korean(400), tags: ['a', 'b'] });
    for (const chunk of chunks) expect(estimateTokens(chunk.text)).toBeLessThanOrEqual(512);
  });

  it('carries the nearest heading into each chunk', () => {
    const content = ['# Top', 'intro line', '', '## Details', 'detail line'].join('\n');
    const chunks = chunkNote({ title: 'T', content });
    expect(chunks.map((c) => c.heading)).toEqual(['Top', 'Details']);
  });

  it('prefixes every chunk with title and heading so an orphan chunk keeps its subject', () => {
    const content = ['## Section', korean(120)].join('\n');
    const chunks = chunkNote({ title: 'My Note', content, folder: 'projects/x', tags: ['t'] });
    for (const chunk of chunks) {
      expect(chunk.text.startsWith('[projects/x] My Note > Section\ntags: t\n\n')).toBe(true);
    }
  });

  it('does not treat a # inside a fenced code block as a heading', () => {
    const content = ['intro', '', '```sh', '# not a heading', 'echo hi', '```'].join('\n');
    expect(chunkNote({ title: 'T', content }).every((c) => c.heading === null)).toBe(true);
  });

  it('overlaps consecutive chunks inside one section', () => {
    const content = Array.from({ length: 40 }, (_, i) => `${i}번째 문단이다. ${korean(2)}`).join(
      '\n\n',
    );
    const chunks = chunkNote({ title: 'T', content });
    expect(chunks.length).toBeGreaterThan(1);
    const tail = chunks[0].excerpt.slice(-30);
    expect(chunks[1].excerpt.includes(tail.trim().slice(-15))).toBe(true);
  });

  it('numbers chunks in reading order', () => {
    const chunks = chunkNote({ title: 'T', content: korean(300) });
    expect(chunks.map((c) => c.ord)).toEqual(chunks.map((_, i) => i));
  });

  it('strips frontmatter before chunking', () => {
    const content = ['---', 'title: T', '---', '', 'real body'].join('\n');
    expect(chunkNote({ title: 'T', content })[0].excerpt).toBe('real body');
  });
});

describe('buildChunkText', () => {
  it('omits the heading when it repeats the title', () => {
    expect(buildChunkText('T', 'T', 'body')).toBe('T\n\nbody');
  });

  it('joins title and heading with a caret path', () => {
    expect(buildChunkText('T', 'H', 'body')).toBe('T > H\n\nbody');
  });
});
