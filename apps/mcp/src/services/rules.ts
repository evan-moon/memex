import type { MemexClient } from '@memex/db';

type Options = { maxChars?: number };

export const buildRuleInstructions = (
  client: MemexClient,
  options: Options = {},
): string => {
  const maxChars = options.maxChars ?? 8000;
  const rows = client.sqlite
    .prepare("SELECT title, content FROM notes WHERE layer = 'rule' ORDER BY id ASC")
    .all() as { title: string; content: string }[];

  if (rows.length === 0) return '';

  const sections = rows.map((r) => `### ${r.title}\n\n${r.content.trim()}`);
  const joined = `## House Rules\n\n${sections.join('\n\n---\n\n')}`;

  if (joined.length <= maxChars) return joined;

  const truncated = `${joined.slice(0, maxChars)}\n\n... [truncated]`;
  console.warn(
    `[memex] rule instructions truncated: ${joined.length} → ${truncated.length} chars`,
  );
  return truncated;
};
