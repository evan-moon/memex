import { type MemexClient, listRules } from '@memex/db';

export type RuleCard = {
  id: number;
  title: string;
  content: string;
  author: string;
  source: string;
  createdAt: number;
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
  content: note.content,
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
