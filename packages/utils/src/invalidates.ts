import { yamlScalar } from './yaml.ts';

const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)---/;
const BLOCK = /^invalidates:[ \t]*\r?\n(?:[ \t]+-[ \t].*(?:\r?\n|$))*/m;
const ITEM = /^[ \t]+-[ \t]+(.*?)[ \t]*$/gm;

export const parseInvalidates = (content: string): string[] => {
  const front = FRONTMATTER.exec(content)?.[1];
  const block = front ? BLOCK.exec(front)?.[0] : null;
  if (!block) return [];
  return [...block.matchAll(ITEM)]
    .map((match) => yamlScalar(match[1]))
    .filter((text) => text.length > 0);
};

const quoted = (text: string): string => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const block = (texts: string[]): string =>
  `invalidates:\n${texts.map((text) => `  - ${quoted(text)}`).join('\n')}\n`;

export const writeInvalidates = (content: string, texts: string[]): string => {
  const front = FRONTMATTER.exec(content);
  if (!front) return content;
  const without = front[1].replace(BLOCK, '');
  const next = texts.length === 0 ? without : `${without}${block(texts)}`;
  return content.replace(FRONTMATTER, () => `---\n${next}---`);
};
