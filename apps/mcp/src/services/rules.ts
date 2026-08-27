import type { MemexClient } from '@memex/db';

type Options = { maxChars?: number };

const HEADER = '## House Rules';
const SEPARATOR = '\n\n---\n\n';

const withHeader = (sections: string[]) => `${HEADER}\n\n${sections.join(SEPARATOR)}`;

const dropNotice = (count: number) =>
  `${SEPARATOR}_${count} further rule note${count === 1 ? '' : 's'} did not fit and ${
    count === 1 ? 'is' : 'are'
  } not shown here. Search memex for layer \`rule\` before concluding a rule does not exist._`;

// The six notes that are actually behaviour guidance come to 9,761 characters in
// this vault, so a budget under that silently drops a real rule no matter how the
// layer is tidied. Raise it with MEMEX_RULES_MAX_CHARS when that stops being true.
const DEFAULT_MAX_CHARS = 10_000;

export const buildRuleInstructions = (client: MemexClient, options: Options = {}): string => {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const rows = client.sqlite
    .prepare("SELECT title, content FROM notes WHERE layer = 'rule' ORDER BY id ASC")
    .all() as { title: string; content: string }[];

  if (rows.length === 0) return '';

  const sections = rows.map((r) => `### ${r.title}\n\n${r.content.trim()}`);
  const whole = withHeader(sections);
  if (whole.length <= maxChars) return whole;

  const fitting = sections.reduce(
    (count, _, i) =>
      count === i && withHeader(sections.slice(0, i + 1)).length <= maxChars ? count + 1 : count,
    0,
  );
  const dropped = sections.length - fitting;

  // A rule cut mid-sentence reads as a complete rule that says something else, so the budget
  // buys whole notes only. The one exception is a first note too large to fit at all: dropping
  // it would leave the agent with no rules whatsoever.
  if (fitting === 0) {
    console.warn(`[memex] rule note too large for the ${maxChars}-char budget: ${rows[0].title}`);
    return `${whole.slice(0, maxChars)}\n\n... [truncated]`;
  }

  console.warn(
    `[memex] ${dropped} of ${rows.length} rule notes did not fit the ${maxChars}-char budget`,
  );
  return `${withHeader(sections.slice(0, fitting))}${dropNotice(dropped)}`;
};
