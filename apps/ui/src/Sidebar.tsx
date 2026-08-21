import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { NoteRef, Sidebar as SidebarData, Topic } from './api.ts';
import { useT } from './i18n.ts';

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

const PAGE = 300;

// The vault outgrew a single render: 1104 past notes mounted at once is a
// stall, and cutting the list at a fixed limit made the sidebar look like the
// vault ended there. Show a page at a time and say how many are left.
const NoteRows = ({ list, stale }: { list: NoteRef[]; stale: Set<number> }) => {
  const t = useT();
  const [shown, setShown] = useState(PAGE);
  const rest = list.length - shown;

  return (
    <>
      {list.slice(0, shown).map((n) => (
        <NavLink key={n.id} to={`/note/${n.id}`} className={linkClass}>
          {stale.has(n.id) ? (
            <TriangleAlert size={11} style={{ color: 'var(--caution)' }} className="shrink-0" />
          ) : null}
          <span className="truncate">{n.title}</span>
        </NavLink>
      ))}
      {rest > 0 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShown(shown + PAGE);
          }}
          className="mt-1 w-full rounded-md py-1.5 pl-7 pr-2 text-left text-xs text-muted hover:bg-surface hover:text-foreground"
        >
          {t.sidebar.more(rest)}
        </button>
      ) : null}
    </>
  );
};

export const Sidebar = ({
  data,
  topics,
  onNavigate,
}: {
  data: SidebarData;
  topics: Topic[];
  onNavigate?: () => void;
}) => {
  const t = useT();
  const stale = new Set(data.stale);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: closing the mobile drawer on tap
    <nav className="h-full overflow-y-auto pb-10" onClick={onNavigate}>
      <div className="px-4 py-4">
        <NavLink to="/" className="text-[15px] font-bold tracking-tight">
          memex
        </NavLink>
      </div>
      <Section label={t.sidebar.topics} count={topics.length} defaultOpen>
        {topics.map((topic) => (
          <NavLink
            key={topic.tag}
            to={`/topic/${encodeURIComponent(topic.tag)}`}
            className={linkClass}
          >
            <span className="truncate">{topic.tag}</span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted">
              {topic.count}
            </span>
          </NavLink>
        ))}
      </Section>
      <Section label={t.sidebar.state} count={data.counts.state ?? 0} defaultOpen>
        <NoteRows list={data.state} stale={stale} />
      </Section>
      <Section label={t.sidebar.rule} count={data.counts.rule ?? 0}>
        <NoteRows list={data.rule} stale={stale} />
      </Section>
      <p className="mt-3 px-4 text-[11px] leading-5 text-muted">
        {t.sidebar.recordsElsewhere(data.counts.past ?? 0)}
      </p>
    </nav>
  );
};
