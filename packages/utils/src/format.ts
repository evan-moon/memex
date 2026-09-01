export const formatDate = (date: Date): string => date.toISOString().split('T')[0];

export const extractCategory = (folder?: string): string | null =>
  folder ? folder.split('/')[0] : null;

const LEADING_FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n)*/;
const LEADING_H1 = /^#[ \t]+[^\n]*(?:\r?\n)+/;

export const stripFrontmatter = (content: string): string => {
  const peeled = content.replace(LEADING_FRONTMATTER, '');
  if (peeled === content) return content;

  const withoutRepeatedTitle = peeled.replace(LEADING_H1, '');
  const deeper = stripFrontmatter(withoutRepeatedTitle);
  return deeper === withoutRepeatedTitle ? peeled : deeper;
};

export const buildEmbeddingText = (
  title: string,
  content: string,
  folder?: string,
  tags?: string[],
): string => {
  const prefix = folder ? `[${folder}] ` : '';
  const tagLine = tags && tags.length > 0 ? `\ntags: ${tags.join(', ')}` : '';
  return `${prefix}${title}${tagLine}\n\n${stripFrontmatter(content)}`;
};

export type NoteAuthor = 'person' | 'agent';

// Whose memory a note is, not who typed it. A note an agent wrote down from a
// conversation is still the person's — what this separates is an agent's own
// working notes, which it keeps in a `memory/` directory for itself and which
// nobody should be asked to review as though they were their own thinking.
export const authorOfPath = (filePath: string): NoteAuthor =>
  filePath.split('/').includes('memory') ? 'agent' : 'person';
