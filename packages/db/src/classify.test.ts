import { describe, expect, it } from 'vitest';
import { type ClassifyInput, classifyNote, headingsOf } from './classify.ts';

const note = (over: Partial<ClassifyInput> = {}): ClassifyInput => ({
  filePath: '/home/e/Second Brain/a note.md',
  title: 'a note',
  content: 'body',
  layer: 'past',
  tags: [],
  category: null,
  declaredType: null,
  ...over,
});

describe('headingsOf', () => {
  it('ignores headings inside a code fence', () => {
    expect(headingsOf('# real\n\n```\n# fake\n```\n\n## also real')).toEqual(['real', 'also real']);
  });
});

describe('classifyNote', () => {
  it('takes a declared type over every rule', () => {
    const label = classifyNote(note({ declaredType: '규칙', title: '[정정] x' }));
    expect(label).toEqual({ type: '규칙', area: '작업', method: 'declared', confidence: '강' });
  });

  it('reads a blog post off its path', () => {
    const label = classifyNote(note({ filePath: '/dev/evan-blog/content/posts/http3/index.md' }));
    expect(label).toMatchObject({ type: '발행물', area: '글', confidence: '강' });
  });

  it('prefers the book path over the outside-the-vault rule', () => {
    const label = classifyNote(
      note({ filePath: '/dev/evan-blog/content/books/web-network/index.md' }),
    );
    expect(label.type).toBe('책');
  });

  it('calls a note memex does not own a code document', () => {
    expect(classifyNote(note({ filePath: '/dev/memex/README.md', layer: 'external' })).type).toBe(
      '코드문서',
    );
  });

  it('reads a handoff off its title before its tags', () => {
    const label = classifyNote(note({ title: 'memex 세션 인계 2026-08-31', tags: ['memex'] }));
    expect(label).toMatchObject({ type: '세션기록', method: 'title' });
  });

  it('reads a handoff off its headings when the title says nothing', () => {
    const label = classifyNote(
      note({
        content: '## 오늘 한 작업\n\nx\n\n## 다음 작업\n\ny\n\n## Resume\n\nz',
        tags: ['memex'],
      }),
    );
    expect(label).toMatchObject({ type: '세션기록', method: 'heading' });
  });

  it('reads an amendment off its title', () => {
    expect(classifyNote(note({ title: '[Amendment] x' })).type).toBe('정정');
    expect(classifyNote(note({ title: '[정정] x' })).type).toBe('정정');
  });

  it('reads a rule off its layer', () => {
    expect(classifyNote(note({ layer: 'rule' })).type).toBe('규칙');
  });

  it('marks a tag-only match as weak', () => {
    expect(classifyNote(note({ tags: ['opula'] }))).toEqual({
      type: '제품작업',
      area: '내 제품',
      method: 'tag',
      confidence: '약',
    });
    expect(classifyNote(note({ tags: ['1on1'] }))).toMatchObject({
      type: '업무메모',
      confidence: '약',
    });
  });

  it('needs length as well as a closing heading to call something an essay', () => {
    const short = note({ content: '## 마치며\n\nthat is all' });
    expect(classifyNote(short).type).toBe('미분류');

    const long = note({ content: `## 마치며\n\n${'긴 글 '.repeat(1000)}` });
    expect(classifyNote(long)).toMatchObject({ type: '에세이', method: 'heading' });
  });

  it('falls back to 미분류 with weak confidence', () => {
    expect(classifyNote(note())).toEqual({
      type: '미분류',
      area: '기타',
      method: 'fallback',
      confidence: '약',
    });
  });
});
