// A new note names itself in its first line, the way a document does, rather
// than in a field beside it. What is typed after `# ` is the note's title, and
// what follows is the note.
const FIRST_LINE = /^[ \t]*\n*/;
const TITLE = /^#[ \t]+([^\n]*)/;

export const titleOf = (body: string): string => {
  const match = TITLE.exec(body.replace(FIRST_LINE, ''));
  return match ? (match[1] ?? '').trim() : '';
};

export const bodyUnder = (body: string): string => {
  const bare = body.replace(FIRST_LINE, '');
  const match = TITLE.exec(bare);
  return match ? bare.slice(match[0].length).replace(/^\n+/, '') : bare;
};

export const withTitle = (title: string, under: string): string =>
  under === '' ? `# ${title}\n` : `# ${title}\n\n${under}`;

// Whether what is under the title is still the scaffold it was handed. Changing
// the kind of note should bring the sections that kind asks for, and must not
// take away a word anybody wrote.
export const isUntouched = (under: string, templates: string[]): boolean =>
  under.trim() === '' || templates.some((template) => under.trim() === template.trim());
