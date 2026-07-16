import { describe, expect, it } from 'vitest';
import { formatSize, toSnippet } from './search-notes.ts';

describe('toSnippet', () => {
  it('strips leading frontmatter and collapses whitespace', () => {
    const content = '---\ntitle: 힙 정렬\ntags:\n  - heap\n---\n\n첫 문단이다.\n\n둘째   문단이다.';
    expect(toSnippet(content)).toBe('첫 문단이다. 둘째 문단이다.');
  });

  it('truncates long content with ellipsis', () => {
    const snippet = toSnippet('가'.repeat(500));
    expect(snippet).toHaveLength(201);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('returns short content without frontmatter unchanged', () => {
    expect(toSnippet('짧은 노트')).toBe('짧은 노트');
  });
});

describe('formatSize', () => {
  it('shows raw chars under 1k', () => {
    expect(formatSize(200)).toBe('200 chars');
  });

  it('shows k-suffixed size at 1k and above', () => {
    expect(formatSize(15300)).toBe('15.3k chars');
  });
});
