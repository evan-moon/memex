import { describe, expect, it } from 'vitest';
import {
  authorOfPath,
  buildEmbeddingText,
  extractCategory,
  formatDate,
  noteProse,
  stripFrontmatter,
} from './format.ts';

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

  it('peels a second frontmatter block a normalization pass stacked on the first', () => {
    const stacked =
      '---\ntitle: T\nlayer: past\n---\n\n# T\n\n---\ntitle: T\ncategory: memory\n---\n\n# T\n\nBody';
    expect(stripFrontmatter(stacked)).toBe('# T\n\nBody');
  });

  it('peels stacked blocks with no heading between them', () => {
    expect(stripFrontmatter('---\na: 1\n---\n---\nb: 2\n---\nBody')).toBe('Body');
  });

  it('keeps a heading whose horizontal rule only looks like a second block', () => {
    expect(stripFrontmatter('---\ntitle: T\n---\n\n# T\n\n---\n\nBody')).toBe('# T\n\n---\n\nBody');
  });
});

describe('noteProse', () => {
  it('finds nothing in a note that is metadata and its own title twice', () => {
    const shell = '---\ntitle: T\n---\n\n# T\n\n---\ntitle: T\ncategory: memory\n---\n\n# T\n';
    expect(noteProse(shell)).toBe('');
  });

  it('finds nothing in a note that is only a title', () => {
    expect(noteProse('---\ntitle: T\n---\n\n# T')).toBe('');
  });

  it('returns the prose a note actually carries', () => {
    expect(noteProse('---\ntitle: T\n---\n\n# T\n\nLG 울트라파인 5k')).toBe('LG 울트라파인 5k');
  });

  it('finds nothing in a note that is its own title twice', () => {
    expect(noteProse('---\ntitle: T\n---\n\n# T\n\n# T')).toBe('');
  });

  it('stops at the first heading that is not the title again', () => {
    expect(noteProse('---\ntitle: T\n---\n\n# T\n\n# 개요\n\n- a')).toBe('# 개요\n\n- a');
  });

  it('counts a heading that says something the title does not', () => {
    expect(noteProse('# T\n\n## 다음 작업\n\n- 정리')).toBe('## 다음 작업\n\n- 정리');
  });
});

describe('authorOfPath', () => {
  it("calls a note in a memory directory the agent's own", () => {
    expect(authorOfPath('/vault/projects/opula/memory/drivers.md')).toBe('agent');
  });

  it("calls everything else the person's, however it was typed", () => {
    expect(authorOfPath('/vault/projects/opula/opula.md')).toBe('person');
    expect(authorOfPath('/vault/work/people/jaedo.md')).toBe('person');
  });

  it('does not mistake a word that merely contains memory for the directory', () => {
    expect(authorOfPath('/vault/learning/memory-models.md')).toBe('person');
    expect(authorOfPath('/vault/memoryless/a.md')).toBe('person');
  });
});
