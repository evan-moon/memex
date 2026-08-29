import { Languages, LayoutDashboard, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  api,
  type Overview as OverviewData,
  type Sidebar as SidebarData,
  type Topic,
} from './api.ts';
import { ChatScreen } from './Chat.tsx';
import { ConnectScreen } from './Connect.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { firstRunSettled, gateFrom, settleFirstRun } from './first-run.ts';
import { HypothesisScreen } from './Hypothesis.tsx';
import { useLocale } from './i18n.ts';
import { Overview } from './Overview.tsx';
import { Palette } from './Palette.tsx';
import { RegisterScreen, RegisterSubjectsScreen } from './Register.tsx';
import { RepairScreen } from './Repair.tsx';
import { RulesScreen } from './Rules.tsx';
import { Sidebar } from './Sidebar.tsx';
import { NoteScreen, NotFoundScreen, SearchScreen, TopicScreen } from './screens.tsx';
import { TagsScreen } from './Tags.tsx';
import { ThreadScreen, ThreadsScreen } from './Thread.tsx';
import { useTheme } from './theme.ts';
import { useAsync } from './useAsync.ts';

export const App = () => {
  const { theme, toggle: toggleTheme } = useTheme();
  const { locale, t, toggle: toggleLocale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [settled, setSettled] = useState(firstRunSettled);

  // Loaded beside the app rather than with it. `claude auth status` is a child
  // process with a fifteen-second timeout of its own, and a machine where it
  // hangs would otherwise be a machine where memex never finishes loading.
  const { data: claude, failure: claudeFailure } = useAsync(() => api.claude(), 'claude');
  const gate = gateFrom({ claude, failed: claudeFailure !== null }, settled);

  // Settled by having seen it done, not by the gate happening to be open: a
  // probe that failed opens the gate for this launch without deciding that
  // setup is behind them.
  useEffect(() => {
    if (claude?.kind !== 'ready' || settled) return;
    settleFirstRun();
    setSettled(true);
  }, [claude, settled]);

  const skipFirstRun = () => {
    settleFirstRun();
    setSettled(true);
    navigate('/');
  };

  useEffect(() => {
    Promise.all([api.sidebar(), api.topics(), api.overview()]).then(([s, t, o]) => {
      setSidebar(s);
      setTopics(t);
      setOverview(o);
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger, not an input — dropping it would leave the menu open across navigation
  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!sidebar || !topics || !overview) {
    return <div className="p-10 text-sm text-muted">{t.common.loading}</div>;
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line lg:block">
        <Sidebar data={sidebar} topics={topics} />
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            aria-label={t.common.close}
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawer(false)}
          />
          <div className="pane absolute inset-y-0 left-0 w-72 border-r border-line">
            <Sidebar data={sidebar} topics={topics} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}

      <Palette open={palette} onClose={() => setPalette(false)} />

      <div className="pane flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2 sm:px-5">
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-surface lg:hidden"
            onClick={() => setDrawer(!drawer)}
            aria-label={t.app.menu}
          >
            {drawer ? <X size={16} /> : <Menu size={16} />}
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-surface"
            onClick={() => navigate('/')}
            aria-label={t.app.overview}
          >
            <LayoutDashboard size={16} />
          </button>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex min-w-0 max-w-lg flex-1 items-center gap-2 rounded-lg border border-line bg-surface py-2 pl-3 pr-3 text-left text-sm text-muted hover:border-line-strong"
          >
            <Search size={14} className="shrink-0" />
            <span className="truncate">{t.app.searchPlaceholder}</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md p-2 text-xs text-muted hover:bg-surface"
            onClick={toggleLocale}
            aria-label={t.app.language}
            title={t.switchLanguage}
          >
            <Languages size={16} />
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-surface"
            onClick={toggleTheme}
            aria-label={t.app.theme}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <ErrorBoundary key={location.pathname} t={t}>
            <Routes>
              <Route
                path="/"
                element={
                  gate === 'needed' ? (
                    <Navigate to="/connect" replace />
                  ) : gate === 'clear' ? (
                    <Overview data={overview} />
                  ) : (
                    <div className="p-10 text-sm text-muted">{t.common.loading}</div>
                  )
                }
              />
              <Route path="/chat" element={<ChatScreen />} />
              <Route path="/topic/:tag" element={<TopicScreen />} />
              <Route path="/threads" element={<ThreadsScreen />} />
              <Route path="/thread/:id" element={<ThreadScreen />} />
              <Route path="/note/:id" element={<NoteScreen />} />
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/repair/evidence" element={<RepairScreen />} />
              <Route path="/tags" element={<TagsScreen />} />
              <Route path="/rules" element={<RulesScreen />} />
              <Route path="/register" element={<RegisterSubjectsScreen />} />
              <Route path="/register/:subject" element={<RegisterScreen />} />
              <Route
                path="/connect"
                element={<ConnectScreen gated={gate === 'needed'} onSkip={skipFirstRun} />}
              />
              <Route path="/inference/:id" element={<HypothesisScreen />} />
              <Route path="*" element={<NotFoundScreen />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
