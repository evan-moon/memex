import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { activateTab, closeTab, useTabs } from './tabs.ts';

// The strip of what is open. It follows the route rather than driving it: the
// address bar is still what says where you are, and this is the list of places
// you can get back to without looking them up again.
export const Tabs = () => {
  const { tabs, active } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();

  const onNote = location.pathname.startsWith('/note/');
  const showing = onNote ? Number(location.pathname.slice('/note/'.length)) : null;

  // Somebody navigated by another door — a wiki link, the palette, back. The
  // strip catches up rather than fighting it.
  useEffect(() => {
    if (showing !== null && active !== showing && tabs.some((tab) => tab.id === showing)) {
      activateTab(showing);
    }
  }, [showing, active, tabs]);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-end gap-px overflow-x-auto border-b border-glass-line px-2">
      {tabs.map((tab) => {
        const here = onNote ? tab.id === showing : tab.id === active;
        return (
          <div
            key={tab.id}
            className={`group flex min-w-0 max-w-52 shrink-0 items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs ${
              here ? 'bg-reading text-foreground' : 'text-muted hover:bg-surface-muted'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                activateTab(tab.id);
                navigate(`/note/${tab.id}`);
              }}
              className="min-w-0 flex-1 truncate text-left"
              title={tab.title}
            >
              {tab.title}
            </button>
            <button
              type="button"
              aria-label={`${tab.title} 닫기`}
              onClick={() => {
                closeTab(tab.id);
                // Closing what you were looking at has to move you somewhere;
                // the store already decided which neighbour.
                if (here) {
                  const left = tabs.filter((open) => open.id !== tab.id);
                  const at = tabs.findIndex((open) => open.id === tab.id);
                  const next = left[Math.min(at, left.length - 1)];
                  navigate(next ? `/note/${next.id}` : '/');
                }
              }}
              className="shrink-0 rounded p-0.5 opacity-0 hover:bg-surface group-hover:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
