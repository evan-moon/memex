import type { MemexClient } from '@memex/db';
import { describeRuleScope, parseRuleScope } from '@memex/utils';

type Options = { maxChars?: number };

const HEADER = '## House Rules';
const SEPARATOR = '\n\n---\n\n';

const withHeader = (sections: string[]) => `${HEADER}\n\n${sections.join(SEPARATOR)}`;

const dropNotice = (count: number) =>
  `${SEPARATOR}_${count} further rule note${count === 1 ? '' : 's'} did not fit and ${
    count === 1 ? 'is' : 'are'
  } not shown here. Search memex for layer \`rule\` before concluding a rule does not exist._`;

// Only what a person approved is read back. A rule the agent wrote is stored
// but waits, because injecting it would close the loop between what the agent
// writes and what the next agent is told.
const APPROVED =
  "SELECT title, content, rule_scope FROM notes WHERE layer = 'rule' AND rule_status = 'canonical' ORDER BY id ASC";

// The six notes that are actually behaviour guidance come to 9,761 characters in
// this vault, so a budget under that silently drops a real rule no matter how the
// layer is tidied. Raise it with MEMEX_RULES_MAX_CHARS when that stops being true.
const DEFAULT_MAX_CHARS = 10_000;

export const buildRuleInstructions = (client: MemexClient, options: Options = {}): string => {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const rows = client.sqlite.prepare(APPROVED).all() as {
    title: string;
    content: string;
    rule_scope: string | null;
  }[];

  if (rows.length === 0) return '';

  // A rule that applies everywhere is dropped last. Ordering by id meant the
  // budget kept whichever rules happened to be written first, so a rule about
  // one folder could push out one that governs every conversation.
  const scoped = rows
    .map((row) => ({ ...row, scope: parseRuleScope(row.rule_scope) }))
    .sort((a, b) => Number(a.scope?.kind !== 'global') - Number(b.scope?.kind !== 'global'));

  const sections = scoped.map((r) => {
    const where =
      r.scope === null || r.scope.kind === 'global'
        ? ''
        : `\n\n_Applies to ${describeRuleScope(r.scope)}._`;
    return `### ${r.title}${where}\n\n${r.content.trim()}`;
  });
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
    console.warn(`[memex] rule note too large for the ${maxChars}-char budget: ${scoped[0].title}`);
    return `${whole.slice(0, maxChars)}\n\n... [truncated]`;
  }

  console.warn(
    `[memex] ${dropped} of ${rows.length} rule notes did not fit the ${maxChars}-char budget`,
  );
  return `${withHeader(sections.slice(0, fitting))}${dropNotice(dropped)}`;
};
