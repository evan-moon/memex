import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { Sidebar as SidebarData, VaultTree } from './api.ts';
import { useT } from './i18n.ts';
import { Tree } from './Tree.tsx';

const rowClass = ({ isActive }: { isActive: boolean }) =>
  `flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
    isActive ? 'bg-surface-muted text-foreground' : 'text-muted hover:bg-surface'
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

// Three things a person comes here to do, then the shelf the notes sit on, then
// settings. Everything memex worked out from the notes — topics, beliefs, rules,
// values — is reached from inside those, not from a list here that grows.
export const Sidebar = ({
  data,
  tree,
  onNavigate,
  onHistory,
  onChat,
}: {
  data: SidebarData;
  tree: VaultTree | null;
  onNavigate?: () => void;
  onHistory: (note: { id: number; title: string }) => void;
  onChat: () => void;
}) => {
  const t = useT();
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: closing the mobile drawer on tap
    <nav className="h-full overflow-y-auto pb-10" onClick={onNavigate}>
      {/* Clearance for the traffic lights, which sit over the sidebar because
          the title bar is hidden. */}
      <div className="drag h-13" />
      <div className="px-4">
        <NavLink to="/" end className={rowClass}>
          {t.sidebar.check}
          {/* That something is waiting, not how much. A number here would grow
              on days nobody looked and read as a debt. */}
          {data.rulesWaiting > 0 ? (
            <i className="size-1.5 rounded-full bg-primary" aria-hidden />
          ) : null}
        </NavLink>
        <NavLink to="/search" className={rowClass}>
          {t.sidebar.find}
        </NavLink>
        <button type="button" onClick={onChat} className={rowClass({ isActive: false })}>
          {t.sidebar.fix}
        </button>
      </div>
      <div className="mx-4 my-2 border-glass-line border-t" />
      {tree === null ? null : (
        <Section label={t.sidebar.notes} count={tree.roots.length} defaultOpen>
          <div className="px-2">
            <Tree tree={tree} onNavigate={onNavigate} onHistory={onHistory} />
          </div>
        </Section>
      )}
      <div className="px-4">
        <NavLink to="/settings" className={rowClass}>
          {t.settings.screenTitle}
        </NavLink>
      </div>
    </nav>
  );
};
