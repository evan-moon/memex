import { describe, expect, it } from 'vitest';
import { buildEmbeddingText, extractCategory, formatDate, stripFrontmatter } from './format.ts';

describe('formatDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(formatDate(new Date('2024-03-15T00:00:00.000Z'))).toBe('2024-03-15');
  });

  it('pads single-digit month and day', () => {
    expect(formatDate(new Date('2024-01-05T00:00:00.000Z'))).toBe('2024-01-05');
  });
});

describe('extractCategory', () => {
  it('returns the first path segment', () => {
    expect(extractCategory('conversations/alice')).toBe('conversations');
  });

  it('returns the folder itself when there is no slash', () => {
    expect(extractCategory('ideas')).toBe('ideas');
  });

  it('ignores segments beyond the first', () => {
    expect(extractCategory('a/b/c')).toBe('a');
  });

  it('returns null when folder is undefined', () => {
    expect(extractCategory(undefined)).toBeNull();
  });

  it('returns null when folder is an empty string', () => {
    expect(extractCategory('')).toBeNull();
  });
});

describe('buildEmbeddingText', () => {
  it('joins title and content with a blank line', () => {
    expect(buildEmbeddingText('My Note', 'Some content')).toBe('My Note\n\nSome content');
  });

  it('prepends folder prefix when provided', () => {
    expect(buildEmbeddingText('Title', 'Body', 'learning/ts')).toBe('[learning/ts] Title\n\nBody');
  });

  it('appends tags line when tags are provided', () => {
    expect(buildEmbeddingText('Title', 'Body', undefined, ['a', 'b'])).toBe(
      'Title\ntags: a, b\n\nBody',
    );
  });

  it('includes both folder prefix and tags', () => {
    expect(buildEmbeddingText('T', 'B', 'ideas', ['x', 'y'])).toBe('[ideas] T\ntags: x, y\n\nB');
  });

  it('omits tags line when tags array is empty', () => {
    expect(buildEmbeddingText('T', 'B', undefined, [])).toBe('T\n\nB');
  });

  it('drops frontmatter so YAML keys never reach the vector', () => {
    const content =
      '---\ntitle: T\ndate: 2026-08-01\ntags: [a, b]\nlayer: past\n---\n\n# T\n\nBody';
    expect(buildEmbeddingText('T', content)).toBe('T\n\n# T\n\nBody');
  });
});

describe('stripFrontmatter', () => {
  it('removes a leading frontmatter block', () => {
    expect(stripFrontmatter('---\ntitle: T\n---\nBody')).toBe('Body');
  });

  it('leaves content without frontmatter untouched', () => {
    expect(stripFrontmatter('# T\n\nBody')).toBe('# T\n\nBody');
  });

  it('keeps a horizontal rule that appears later in the body', () => {
    expect(stripFrontmatter('# T\n\n---\n\nBody')).toBe('# T\n\n---\n\nBody');
  });

  it('stops at the first closing delimiter', () => {
    expect(stripFrontmatter('---\ntitle: T\n---\nBody\n---\nMore')).toBe('Body\n---\nMore');
  });
});
