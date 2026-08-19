import { LayoutDashboard, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, type Overview as OverviewData, type Sidebar as SidebarData, type Topic } from './api.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Overview } from './Overview.tsx';
import { NoteScreen, SearchScreen, TopicScreen, TopicsScreen } from './screens.tsx';
import { Sidebar } from './Sidebar.tsx';
import { useTheme } from './theme.ts';

export const App = () => {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    Promise.all([api.sidebar(), api.topics(), api.overview()]).then(([s, t, o]) => {
      setSidebar(s);
      setTopics(t);
      setOverview(o);
    });
  }, []);

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('q')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!sidebar || !topics || !overview) {
    return <div className="p-10 text-sm text-muted">…</div>;
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line lg:block">
        <Sidebar data={sidebar} topics={topics} />
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-line bg-background">
            <Sidebar data={sidebar} topics={topics} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2 sm:px-5">
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-surface lg:hidden"
            onClick={() => setDrawer(!drawer)}
            aria-label="메뉴"
          >
            {drawer ? <X size={16} /> : <Menu size={16} />}
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-surface"
            onClick={() => navigate('/')}
            aria-label="Overview"
          >
            <LayoutDashboard size={16} />
          </button>
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              const v = query.trim();
              navigate(v.length === 0 ? '/topics' : `/search?q=${encodeURIComponent(v)}`);
            }}
          >
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색  (⌘K)"
              autoComplete="off"
              className="w-full max-w-lg rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </form>
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-surface"
            onClick={toggle}
            aria-label="테마"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/" element={<Overview data={overview} />} />
            <Route path="/topics" element={<TopicsScreen topics={topics} />} />
            <Route path="/topic/:tag" element={<TopicScreen />} />
            <Route path="/note/:id" element={<NoteScreen />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
