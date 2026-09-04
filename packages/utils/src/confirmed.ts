const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)---/;
const LINE = /^confirmed_at:.*$/m;

// When someone last stood behind what a projection claims, which is not when
// the file last changed. `updated_at` moves for a retag or a renamed title, and
// a staleness check that reads it calls a note freshly confirmed because a tag
// was fixed. This is written only when the claims themselves are written.
export const parseConfirmedAt = (content: string): number | null => {
  const front = FRONTMATTER.exec(content)?.[1];
  const line = front ? LINE.exec(front)?.[0] : null;
  if (!line) return null;
  const value = line
    .slice(line.indexOf(':') + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

export const writeConfirmedAt = (content: string, at: number | null): string => {
  const front = FRONTMATTER.exec(content);
  if (!front) return content;

  const line = at === null ? null : `confirmed_at: ${new Date(at).toISOString()}`;
  const next =
    line === null
      ? front[1].replace(LINE, '').replace(/\n{2,}/g, '\n')
      : LINE.test(front[1])
        ? front[1].replace(LINE, line)
        : `${front[1]}${line}\n`;

  return content.replace(FRONTMATTER, () => `---\n${next}---`);
};
