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

const LEADING_TITLE = /^#[ \t]+([^\n]*?)[ \t]*(?:\r?\n|$)/;

// A note file can be shell all the way down — metadata, the title again, more
// metadata — so this peels in rounds until a round changes nothing. The title
// travels with it: the first heading names what an echo is, and every round
// after that holds the later ones to it.
const peelShell = (content: string, title?: string): string => {
  const bare = content.replace(LEADING_FRONTMATTER, '');
  const heading = LEADING_TITLE.exec(bare);
  const echo = heading !== null && (title === undefined || heading[1] === title);
  const peeled = echo && heading ? bare.slice(heading[0].length).replace(/^\s*\r?\n/, '') : bare;
  if (peeled === content) return content;
  return peelShell(peeled, echo && heading ? heading[1] : title);
};

// Is there anything under the title? A heading only counts as shell when it
// repeats the title, which is what `title` is for. Without it any leading
// heading is taken for an echo, and someone whose whole note is `# 테스트` is
// told they wrote nothing.
export const noteProse = (content: string, title?: string): string =>
  peelShell(content, title).trim();

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
