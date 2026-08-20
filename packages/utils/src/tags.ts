/**
 * Two tags are the same tag when only their spelling differs — case, hyphen,
 * underscore, spacing, or Unicode width. That is decidable, unlike whether
 * `토스` means `toss`, which needs to know they are the same word, or whether
 * `coaching` and `toss` are the same subject just because every coaching note
 * happens to be a Toss note. Only the decidable case belongs in a rule.
 */
export const tagKey = (tag: string): string =>
  tag
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[-_\s]/g, '');

export type TagVariant = {
  /** The spelling to keep: whichever is used most. */
  keep: string;
  /** Spellings to fold into it, and how many notes carry each. */
  drop: { tag: string; count: number }[];
  notes: number;
};

export const findTagVariants = (counts: Map<string, number>): TagVariant[] => {
  const groups = [...counts.entries()].reduce<Map<string, { tag: string; count: number }[]>>(
    (acc, [tag, count]) => {
      const key = tagKey(tag);
      return acc.set(key, [...(acc.get(key) ?? []), { tag, count }]);
    },
    new Map(),
  );

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const [keep, ...drop] = [...group].sort(
        (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
      );
      return {
        keep: keep.tag,
        drop,
        notes: drop.reduce((acc, d) => acc + d.count, 0),
      };
    })
    .sort((a, b) => b.notes - a.notes);
};

const INLINE = /^(tags:[ \t]*\[)([^\]]*)(\])/m;
const BLOCK = /^tags:[ \t]*\r?\n((?:[ \t]*-[ \t]*.*(?:\r?\n|$))+)/m;
const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)---/;

const rewriteFrontmatter = (front: string, rename: Map<string, string>): string => {
  const swap = (tag: string) => rename.get(tag.trim()) ?? tag.trim();
  const dedupe = (list: string[]) => [...new Set(list.filter((t) => t.length > 0))];

  if (INLINE.test(front)) {
    return front.replace(INLINE, (_all, open: string, body: string, close: string) => {
      const next = dedupe(body.split(',').map(swap));
      return `${open}${next.join(', ')}${close}`;
    });
  }

  if (BLOCK.test(front)) {
    return front.replace(BLOCK, (all: string, body: string) => {
      const indent = /^([ \t]*)-/.exec(body)?.[1] ?? '  ';
      const next = dedupe(
        body
          .split(/\r?\n/)
          .filter((line) => line.trim().startsWith('-'))
          .map((line) => swap(line.replace(/^[ \t]*-[ \t]*/, ''))),
      );
      return `tags:\n${next.map((t) => `${indent}- ${t}`).join('\n')}${all.endsWith('\n') ? '\n' : ''}`;
    });
  }

  return front;
};

/**
 * Rewrite the tags in a note's frontmatter, leaving the rest of the file
 * untouched — these are Obsidian files a person also edits by hand, so a
 * rewrite that reformats what it did not need to change is a rewrite that
 * loses arguments with git. Scoped to the frontmatter block on purpose: a
 * `tags: [...]` line inside a fenced code block is prose, not metadata.
 */
export const rewriteTags = (content: string, rename: Map<string, string>): string =>
  content.replace(FRONTMATTER, (all, front: string) => {
    const next = rewriteFrontmatter(front, rename);
    return next === front ? all : `---\n${next}---`;
  });
