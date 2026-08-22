const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)---/;
const LINE = /^derives_from:.*$/m;

// The ids a note declares as what it was built from. The file is the record —
// a person edits these notes by hand, and a projection that only exists in a
// database is one a reindex can lose.
export const parseDerivesFrom = (content: string): number[] => {
  const front = FRONTMATTER.exec(content)?.[1];
  const line = front ? LINE.exec(front)?.[0] : null;
  if (!line) return [];
  return [...line.matchAll(/\d+/g)].map((match) => Number(match[0]));
};

export const writeDerivesFrom = (content: string, sourceIds: number[]): string => {
  const front = FRONTMATTER.exec(content);
  if (!front) return content;

  const next =
    sourceIds.length === 0
      ? front[1].replace(LINE, '').replace(/\n{2,}/g, '\n')
      : LINE.test(front[1])
        ? front[1].replace(LINE, `derives_from: [${sourceIds.join(', ')}]`)
        : `${front[1]}derives_from: [${sourceIds.join(', ')}]\n`;

  return content.replace(FRONTMATTER, `---\n${next}---`);
};
