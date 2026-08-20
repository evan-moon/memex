import { describe, expect, it } from 'vitest';
import { bodyOf } from './notes.ts';

describe('bodyOf', () => {
  it('drops the frontmatter block', () => {
    const content = ['---', 'title: 제목', 'tags: [a]', '---', '', '본문이다.', ''].join('\n');
    expect(bodyOf(content, '제목')).toBe('본문이다.\n');
  });

  it('drops an H1 that only repeats the title', () => {
    const content = ['---', 'title: 제목', '---', '', '# 제목', '', '본문이다.', ''].join('\n');
    expect(bodyOf(content, '제목')).toBe('본문이다.\n');
  });

  it('keeps an H1 that says something the title does not', () => {
    const content = ['---', 'title: 제목', '---', '', '# 다른 제목', '', '본문.', ''].join('\n');
    expect(bodyOf(content, '제목')).toContain('# 다른 제목');
  });

  it('leaves a note that has no frontmatter alone', () => {
    expect(bodyOf('그냥 본문.\n', '제목')).toBe('그냥 본문.\n');
  });

  it('does not treat a leading horizontal rule as frontmatter', () => {
    expect(bodyOf('---\n\n본문.\n', '제목')).toBe('---\n\n본문.\n');
  });

  it('returns empty for a frontmatter-only stub', () => {
    expect(bodyOf(['---', 'title: $title', 'tags:', '---', ''].join('\n'), '$title')).toBe('');
  });
});
