export const formatDate = (date: Date): string => date.toISOString().split('T')[0];

export const extractCategory = (folder?: string): string | null =>
  folder ? folder.split('/')[0] : null;

export const stripFrontmatter = (content: string): string =>
  content.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n)*/, '');

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
