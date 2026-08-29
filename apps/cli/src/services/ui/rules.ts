import { listRules, type MemexClient } from '@memex/db';
import { stripFrontmatter } from '@memex/utils';

export type RuleCard = {
  id: number;
  title: string;
  content: string;
  truncated: boolean;
  author: string;
  source: string;
  createdAt: number;
};

const PREVIEW_CHARS = 500;

const headingText = (line: string) => {
  const heading = /^#{1,6}\s+(.*)$/.exec(line);
  return heading === null ? null : heading[1].trim();
};

// Writing a note to a file puts its title at the head of the body, and a few
// older ones carry it twice. The card already shows the title, so every leading
// repeat of it goes.
const dropRepeatedTitle = (body: string, title: string): string => {
  const [first, ...rest] = body.split('\n');
  return headingText(first) === title.trim()
    ? dropRepeatedTitle(rest.join('\n').trimStart(), title)
    : body;
};

// The question this screen asks is "is this a rule", and the opening answers it.
// Putting a whole note in the card meant scrolling all 16,000 characters of one
// just to reach the next card — the card's own scrollbar swallowed the page's.
const preview = (content: string, title: string) => {
  const body = dropRepeatedTitle(stripFrontmatter(content).trim(), title).trim();
  return body.length <= PREVIEW_CHARS
    ? { content: body, truncated: false }
    : { content: `${body.slice(0, PREVIEW_CHARS).trimEnd()}…`, truncated: true };
};

export type RulesScreen = {
  waiting: RuleCard[];
  active: RuleCard[];
};

const toCard = (note: {
  id: number;
  title: string;
  content: string;
  author: string;
  source: string;
  createdAt: number;
}): RuleCard => ({
  id: note.id,
  title: note.title,
  ...preview(note.content, note.title),
  author: note.author,
  source: note.source,
  createdAt: note.createdAt,
});

// Waiting first, because that is the only part of this screen that asks anything
// of the reader. What is already active is here to be read against — a proposal
// is judged next to the rules it would join, not on its own.
export const buildRules = (client: MemexClient): RulesScreen => ({
  waiting: listRules(client, 'provisional').map(toCard),
  active: listRules(client, 'canonical').map(toCard),
});
