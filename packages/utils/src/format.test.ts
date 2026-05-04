import { describe, expect, it } from 'vitest';
import { buildEmbeddingText, extractCategory, formatDate } from './format.ts';

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
    expect(buildEmbeddingText('T', 'B', 'ideas', ['x', 'y'])).toBe(
      '[ideas] T\ntags: x, y\n\nB',
    );
  });

  it('omits tags line when tags array is empty', () => {
    expect(buildEmbeddingText('T', 'B', undefined, [])).toBe('T\n\nB');
  });
});
