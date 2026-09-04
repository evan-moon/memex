// Where a rule applies. Three shapes and no free text: a scope nobody can
// check is a label, and the reason it exists is that a budget too small for
// every approved rule has to drop the narrow ones first. `global` is what a
// rule means when it does not say.
export type RuleScope =
  | { kind: 'global' }
  | { kind: 'folder'; path: string }
  | { kind: 'tag'; name: string };

export const GLOBAL_SCOPE = 'global';

export const parseRuleScope = (value: string | null | undefined): RuleScope | null => {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (text === GLOBAL_SCOPE) return { kind: 'global' };

  const folder = /^folder:\s*(.+)$/.exec(text);
  if (folder) {
    const path = folder[1].trim().replace(/^\/+|\/+$/g, '');
    return path.length === 0 ? null : { kind: 'folder', path };
  }

  const tag = /^tag:\s*(.+)$/.exec(text);
  if (tag) {
    const name = tag[1].trim();
    return name.length === 0 ? null : { kind: 'tag', name };
  }

  return null;
};

export const formatRuleScope = (scope: RuleScope): string => {
  if (scope.kind === 'global') return GLOBAL_SCOPE;
  if (scope.kind === 'folder') return `folder:${scope.path}`;
  return `tag:${scope.name}`;
};

export const describeRuleScope = (scope: RuleScope): string => {
  if (scope.kind === 'global') return 'every conversation';
  if (scope.kind === 'folder') return `notes under ${scope.path}`;
  return `notes tagged ${scope.name}`;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)---/;
// `rule_scope`, not `scope`: the register model reserves a `scope` of its own
// (`global | period`) for the events it folds, and a note must never have to
// mean both with one key.
const LINE = /^rule_scope:.*$/m;

export const parseScopeLine = (content: string): string | null => {
  const front = FRONTMATTER.exec(content)?.[1];
  const line = front ? LINE.exec(front)?.[0] : null;
  if (!line) return null;
  const value = line
    .slice(line.indexOf(':') + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
  return value.length === 0 ? null : value;
};

export const writeScopeLine = (content: string, scope: string | null): string => {
  const front = FRONTMATTER.exec(content);
  if (!front) return content;

  const next =
    scope === null
      ? front[1].replace(LINE, '').replace(/\n{2,}/g, '\n')
      : LINE.test(front[1])
        ? front[1].replace(LINE, `rule_scope: ${scope}`)
        : `${front[1]}rule_scope: ${scope}\n`;

  return content.replace(FRONTMATTER, () => `---\n${next}---`);
};
