import type { MemexClient } from '@memex/db';
import { describeRuleScope, parseRuleScope } from '@memex/utils';

type Options = { maxChars?: number };

// Precedence has to be stated here rather than in a rule note, because a rule
// cannot be the thing that decides whether rules win. Everything above this
// header is memex's own convention, written in code and the same for everyone;
// what follows it is this person's, and theirs is the one that was approved.
const HEADER = `## House Rules

These are the user's own, and they approved each one. Where a rule below
contradicts a convention stated above, follow the rule.`;
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

// Sized to what is actually behaviour guidance, which is the only thing the
// layer should hold. Measured 2026-09-05: seven approved rules assemble to
// 16,361 characters, and two more waiting on approval add 1,617. A budget under
// that drops a real rule and says so, which is better than silence but is still
// a rule that does not apply.
//
// Raising it is not free — this block goes out with every session — so the
// answer to it growing again is a layer with records in it, not a bigger
// number. Override with MEMEX_RULES_MAX_CHARS.
const DEFAULT_MAX_CHARS = 20_000;

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
