import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { NoteRef, Sidebar as SidebarData, Topic } from './api.ts';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-1.5 truncate rounded-md py-1.5 pl-7 pr-2 text-xs ${
    isActive ? 'bg-surface-muted text-foreground' : 'text-muted hover:bg-surface hover:text-foreground'
  }`;

const Section = ({
  label,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="px-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-surface"
      >
        <Chevron size={13} className="text-muted" />
        {label}
        <span className="ml-auto text-[11px] tabular-nums text-muted">{count}</span>
      </button>
      {open ? <div className="pb-1">{children}</div> : null}
    </div>
  );
};

const notes = (list: NoteRef[], stale: Set<number>) =>
  list.map((n) => (
    <NavLink key={n.id} to={`/note/${n.id}`} className={linkClass}>
      {stale.has(n.id) ? (
        <TriangleAlert size={11} style={{ color: 'var(--caution)' }} className="shrink-0" />
      ) : null}
      <span className="truncate">{n.title}</span>
    </NavLink>
  ));

export const Sidebar = ({
  data,
  topics,
  onNavigate,
}: {
  data: SidebarData;
  topics: Topic[];
  onNavigate?: () => void;
}) => {
  const stale = new Set(data.stale);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: closing the mobile drawer on tap
    <nav className="h-full overflow-y-auto pb-10" onClick={onNavigate}>
      <div className="px-4 py-4">
        <NavLink to="/" className="text-[15px] font-bold tracking-tight">
          memex
        </NavLink>
      </div>
      <Section label="지금 믿는 것" count={data.counts.state ?? 0} defaultOpen>
        {notes(data.state, stale)}
      </Section>
      <Section label="기록" count={data.counts.past ?? 0}>
        {notes(data.past, stale)}
      </Section>
      <Section label="지침" count={data.counts.rule ?? 0}>
        {notes(data.rule, stale)}
      </Section>
      <Section label="주제" count={topics.length} defaultOpen>
        {topics.map((t) => (
          <NavLink key={t.tag} to={`/topic/${encodeURIComponent(t.tag)}`} className={linkClass}>
            <span className="truncate">{t.tag}</span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted">{t.count}</span>
          </NavLink>
        ))}
      </Section>
    </nav>
  );
};
