import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { type Strings, useT } from './i18n.ts';
import { remarkWikiLinks, WIKI_TITLE_PROP } from './wiki-links.ts';

// Reading the text back out of what was rendered rather than out of the source:
// remark has already resolved the wiki links and entities by this point, so this
// is the paragraph as the reader saw it, which is what a correction should quote.
const textOf = (node: unknown): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : typeof node === 'object' && node !== null && 'props' in node
        ? textOf((node as { props: { children?: unknown } }).props.children)
        : '';

const componentsFor = (
  targets: Map<string, number>,
  t: Strings,
  onPick?: (text: string) => void,
  slot?: Slot,
): Components => ({
  h1: ({ children }) => <h2 className="doc-h2">{children}</h2>,
  h2: ({ children }) => <h2 className="doc-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="doc-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="doc-h4">{children}</h4>,
  h5: ({ children }) => <h4 className="doc-h4">{children}</h4>,
  h6: ({ children }) => <h4 className="doc-h4">{children}</h4>,
  p: ({ children }) => {
    const text = textOf(children);
    // Matched by what it says rather than by position: the source is re-parsed
    // on every keystroke in the draft below, and an index would slide out from
    // under the reader as they type.
    const here = slot !== undefined && slot.after === text;
    const body =
      onPick === undefined || here ? (
        <p className="doc-body">{children}</p>
      ) : (
        // biome-ignore lint/a11y/useKeyWithClickEvents: clicking a paragraph is a shortcut to the correction the header button already starts, quoted rather than empty. Reaching the quote by keyboard would put every paragraph in the tab order, which costs a keyboard reader the whole note to save them one paste.
        <p
          className="doc-body -mx-2 cursor-text rounded px-2 hover:bg-surface-muted"
          onClick={() => onPick(text)}
        >
          {children}
        </p>
      );

    return here ? (
      <>
        <span className="block rounded bg-accent-soft/60 px-2 -mx-2">{body}</span>
        {slot?.node}
      </>
    ) : (
      body
    );
  },
  ul: ({ children }) => <ul className="doc-ul">{children}</ul>,
  ol: ({ children }) => <ol className="doc-ol">{children}</ol>,
  li: ({ children, className }) => (
    <li className={className?.includes('task-list-item') ? 'doc-li doc-task' : 'doc-li'}>
      {children}
    </li>
  ),
  code: ({ children }) => <code className="doc-code">{children}</code>,
  pre: ({ children }) => <pre className="doc-pre">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="doc-blockquote">{children}</blockquote>,
  hr: () => <hr className="doc-hr" />,
  img: ({ src, alt }) => (
    <img className="doc-img" src={typeof src === 'string' ? src : ''} alt={alt ?? ''} />
  ),
  table: ({ children }) => (
    <div className="doc-table-wrap">
      <table className="doc-table">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="doc-th">{children}</th>,
  td: ({ children }) => <td className="doc-td">{children}</td>,
  a: ({ href, children, node }) => {
    const title = node?.properties?.[WIKI_TITLE_PROP];
    if (typeof title !== 'string') {
      return (
        <a className="doc-link" href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    }
    const id = targets.get(title.toLowerCase());
    if (id === undefined) {
      return (
        <span className="doc-wiki-dead" title={t.note.deadLink}>
          {children}
        </span>
      );
    }
    return (
      <Link className="doc-wiki" to={`/note/${id}`}>
        {children}
      </Link>
    );
  },
});

// What to put under one paragraph, and which. This is how writing happens where
// the reader was looking instead of at the top of a fifteen-thousand character
// note they then have to scroll back down.
export type Slot = { after: string; node: React.ReactNode };

export const Markdown = ({
  children,
  links = [],
  onPick,
  slot,
}: {
  children: string;
  links?: { title: string; id: number }[];
  onPick?: (text: string) => void;
  slot?: Slot;
}) => {
  const t = useT();
  const targets = new Map(links.map((l) => [l.title.toLowerCase(), l.id]));
  return (
    <div className="doc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikiLinks]}
        components={componentsFor(targets, t, onPick, slot)}
        urlTransform={(url) => (url.startsWith('wiki:') ? url : defaultUrlTransform(url))}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};
