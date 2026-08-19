import { useState } from 'react';
import type { NoteRef, Sidebar as SidebarData } from './api.ts';
import type { Route } from './route.ts';

const Section = ({
  label,
  count,
  children,
  defaultOpen,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="sec">
      <button type="button" onClick={() => setOpen(!open)}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        {label}
        <span className="n">{count}</span>
      </button>
      {open ? children : null}
    </div>
  );
};

const noteLinks = (notes: NoteRef[], stale: Set<number>, route: Route) => (
  <ul>
    {notes.map((n) => (
      <li key={n.id}>
        <a
          className={route.name === 'note' && route.id === n.id ? 'on' : undefined}
          href={`#/note/${n.id}`}
        >
          {stale.has(n.id) ? <span style={{ color: 'var(--warn)' }}>⚠</span> : null}
          <span className="t">{n.title}</span>
        </a>
      </li>
    ))}
  </ul>
);

export const Sidebar = ({
  data,
  topics,
  route,
}: {
  data: SidebarData;
  topics: { tag: string; count: number }[];
  route: Route;
}) => {
  const stale = new Set(data.stale);
  return (
    <aside className="side">
      <div className="brand">
        <a href="#/">memex</a>
      </div>
      <Section label="지금 믿는 것" count={data.counts.state ?? 0} defaultOpen>
        {noteLinks(data.state, stale, route)}
      </Section>
      <Section label="기록" count={data.counts.past ?? 0}>
        {noteLinks(data.past, stale, route)}
      </Section>
      <Section label="지침" count={data.counts.rule ?? 0}>
        {noteLinks(data.rule, stale, route)}
      </Section>
      <Section label="주제" count={topics.length}>
        <ul>
          {topics.map((t) => (
            <li key={t.tag}>
              <a
                className={route.name === 'topic' && route.tag === t.tag ? 'on' : undefined}
                href={`#/topic/${encodeURIComponent(t.tag)}`}
              >
                <span className="t">{t.tag}</span>
                <span className="n">{t.count}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  );
};
