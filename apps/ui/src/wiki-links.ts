export type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] };

const WIKI = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

export const splitWikiLinks = (value: string): MdNode[] => {
  const { at, out } = [...value.matchAll(WIKI)].reduce<{ at: number; out: MdNode[] }>(
    (acc, m) => ({
      at: (m.index ?? 0) + m[0].length,
      out: [
        ...acc.out,
        ...((m.index ?? 0) > acc.at ? [{ type: 'text', value: value.slice(acc.at, m.index) }] : []),
        {
          type: 'link',
          url: `wiki:${m[1].trim()}`,
          children: [{ type: 'text', value: (m[2] ?? m[1]).trim() }],
        },
      ],
    }),
    { at: 0, out: [] },
  );

  if (out.length === 0) return [{ type: 'text', value }];
  return at < value.length ? [...out, { type: 'text', value: value.slice(at) }] : out;
};

// A remark plugin rather than a replace over the raw source, because `[[x]]`
// inside a code fence is code. The parser already knows that difference; a
// regex over the source does not.
export const remarkWikiLinks = () => (tree: MdNode) => {
  const visit = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === 'link') return [child];
      if (child.type !== 'text') {
        visit(child);
        return [child];
      }
      return splitWikiLinks(child.value ?? '');
    });
  };
  visit(tree);
};
