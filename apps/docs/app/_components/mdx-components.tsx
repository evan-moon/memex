import type { ComponentProps, ReactNode } from 'react';

const slugify = (input: string): string =>
  input.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

const flattenText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  if (node && typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props?: { children?: ReactNode } }).props?.children ?? '');
  }
  return '';
};

export const mdxComponents = {
  h1: (props: ComponentProps<'h1'>) => <h1 className="docs-h1" {...props} />,
  h2: (props: ComponentProps<'h2'>) => {
    const fallbackId = slugify(flattenText(props.children));
    return <h2 className="docs-h2" id={props.id ?? fallbackId} {...props} />;
  },
  h3: (props: ComponentProps<'h3'>) => <h3 className="docs-h3" {...props} />,
  p: (props: ComponentProps<'p'>) => <p className="docs-body" {...props} />,
  ul: (props: ComponentProps<'ul'>) => <ul className="docs-ul" {...props} />,
  ol: (props: ComponentProps<'ol'>) => <ol className="docs-ol" {...props} />,
  li: (props: ComponentProps<'li'>) => <li className="docs-li" {...props} />,
  code: (props: ComponentProps<'code'>) => <code className="docs-code" {...props} />,
  pre: (props: ComponentProps<'pre'>) => <pre className="docs-pre" {...props} />,
  a: (props: ComponentProps<'a'>) => (
    <a
      {...props}
      target={props.href?.startsWith('http') ? '_blank' : undefined}
      rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="docs-link"
    />
  ),
  table: (props: ComponentProps<'table'>) => (
    <div className="docs-table-wrap"><table className="docs-table" {...props} /></div>
  ),
  th: (props: ComponentProps<'th'>) => <th className="docs-th" {...props} />,
  td: (props: ComponentProps<'td'>) => <td className="docs-td" {...props} />,
  blockquote: (props: ComponentProps<'blockquote'>) => (
    <blockquote className="docs-blockquote" {...props} />
  ),
  hr: () => <hr className="docs-hr" />,
};
