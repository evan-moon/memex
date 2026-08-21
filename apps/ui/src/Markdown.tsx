import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { type Strings, useT } from './i18n.ts';
import { remarkWikiLinks } from './wiki-links.ts';

const componentsFor = (targets: Map<string, number>, t: Strings): Components => ({
  h1: ({ children }) => <h2 className="doc-h2">{children}</h2>,
  h2: ({ children }) => <h2 className="doc-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="doc-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="doc-h4">{children}</h4>,
  h5: ({ children }) => <h4 className="doc-h4">{children}</h4>,
  h6: ({ children }) => <h4 className="doc-h4">{children}</h4>,
  p: ({ children }) => <p className="doc-body">{children}</p>,
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
  a: ({ href, children }) => {
    if (!href?.startsWith('wiki:')) {
      return (
        <a className="doc-link" href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    }
    const id = targets.get(href.slice('wiki:'.length).toLowerCase());
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

export const Markdown = ({
  children,
  links = [],
}: {
  children: string;
  links?: { title: string; id: number }[];
}) => {
  const t = useT();
  const targets = new Map(links.map((l) => [l.title.toLowerCase(), l.id]));
  return (
    <div className="doc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikiLinks]}
        components={componentsFor(targets, t)}
        urlTransform={(url) => (url.startsWith('wiki:') ? url : defaultUrlTransform(url))}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};
