import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Menu,
  MessageSquare,
  PanelLeft,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  api,
  type Overview as OverviewData,
  type Sidebar as SidebarData,
  type Topic,
  type VaultTree,
} from './api.ts';
import { ChatPanel } from './Chat.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { HistoryPanel } from './History.tsx';
import { HypothesisScreen } from './Hypothesis.tsx';
import { goBack, goForward, useHistory } from './history.ts';
import { useLocale } from './i18n.ts';
import { Onboarding } from './Onboarding.tsx';
import { Overview } from './Overview.tsx';
import { gateFrom } from './onboarding.ts';
import { Palette } from './Palette.tsx';
import { railShown, rememberRail } from './panels.ts';
import { RegisterScreen, RegisterSubjectsScreen } from './Register.tsx';
import { RepairScreen } from './Repair.tsx';
import { RulesScreen } from './Rules.tsx';
import { SettingsScreen } from './Settings.tsx';
import { Sidebar } from './Sidebar.tsx';
import { NoteScreen, NotFoundScreen, SearchScreen, TopicScreen } from './screens.tsx';
import { Tabs } from './Tabs.tsx';
import { TagsScreen } from './Tags.tsx';
import { ThreadScreen, ThreadsScreen } from './Thread.tsx';
import { TodayScreen } from './Today.tsx';
import './theme.ts';
import { useAsync } from './useAsync.ts';

export const App = () => {
  const { locale, t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [tree, setTree] = useState<VaultTree | null>(null);
  const [history, setHistory] = useState<{ id: number; title: string } | null>(null);
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [rail, setRail] = useState(railShown);
  const { canGoBack, canGoForward } = useHistory();

  const toggleRail = () => {
    setRail(!rail);
    rememberRail(!rail);
  };
  const [params, setParams] = useSearchParams();

  // Open-ness lives in the URL rather than in a context. It survives a reload,
  // and it is what lets a value on the register screen open the panel already
  // pointed at itself without a provider in between.
  const chatOpen = params.get('chat') === '1';
  const openChat = () => {
    if (chatOpen) return;
    const next = new URLSearchParams(params);
    next.set('chat', '1');
    setParams(next, { replace: true });
  };
  const toggleChat = () => {
    const next = new URLSearchParams(params);
    if (chatOpen) {
      next.delete('chat');
      next.delete('subject');
      next.delete('note');
    } else {
      next.set('chat', '1');
    }
    setParams(next, { replace: true });
  };

  // One local file read, so it answers before the window has anything to paint.
  // Whether setup is behind them is not a question the probes can settle — a
  // machine that already had Claude Code signed in was never walked through it.
  const [round, setRound] = useState(0);
  const [walked, setWalked] = useState(false);
  const { data: onboarding, failure: onboardingFailure } = useAsync(
    () => api.onboarding(),
    `onboarding-${round}`,
  );
  const gate = gateFrom(onboarding, onboardingFailure !== null, walked);

  useEffect(() => {
    Promise.all([api.sidebar(), api.topics(), api.overview()]).then(([s, t, o]) => {
      setSidebar(s);
      setTopics(t);
      setOverview(o);
    });
    // Loaded beside the rest: the tree is every note in the vault, so it is the
    // one call that grows with the vault rather than with the screen.
    api
      .tree()
      .then(setTree)
      .catch(() => {});
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger, not an input — dropping it would leave the menu open across navigation
  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'k') {
        e.preventDefault();
        setPalette(true);
      }
      // What every macOS app binds these to. The mouse's own back and forward
      // buttons are handled by the window without asking.
      if (e.key === '[') {
        e.preventDefault();
        goBack();
      }
      if (e.key === ']') {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (gate === 'unknown') {
    return <div className="p-10 text-sm text-muted">{t.common.loading}</div>;
  }

  // Not a route and not a redirect. Setup is the whole window until it is done,
  // because a sidebar around it is a set of doors that lead nowhere yet.
  if (gate === 'needed') {
    return (
      <Onboarding
        state={onboarding}
        onRetry={() => setRound((n) => n + 1)}
        onDone={() => setWalked(true)}
      />
    );
  }

  if (!sidebar || !topics || !overview) {
    return <div className="p-10 text-sm text-muted">{t.common.loading}</div>;
  }

  return (
    <div className="flex h-full">
      {/* The width is what moves; the panel inside keeps its own, so the text
          slides out of view rather than reflowing narrower on the way. */}
      <aside
        className={`hidden shrink-0 overflow-hidden border-r border-glass-line transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block ${
          rail ? 'w-64' : 'w-0 border-r-0'
        }`}
      >
        <div className="h-full w-64">
          <Sidebar data={sidebar} tree={tree} onHistory={setHistory} onChat={openChat} />
        </div>
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            aria-label={t.common.close}
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawer(false)}
          />
          <div className="pane absolute inset-y-0 left-0 w-72 border-r border-glass-line">
            <Sidebar
              data={sidebar}
              tree={tree}
              onHistory={setHistory}
              onChat={openChat}
              onNavigate={() => setDrawer(false)}
            />
          </div>
        </div>
      ) : null}

      <Palette open={palette} onClose={() => setPalette(false)} />
      {history === null ? null : <HistoryPanel note={history} onClose={() => setHistory(null)} />}

      <div className="pane flex min-w-0 flex-1 flex-col">
        {/* The title bar is hidden, so the traffic lights float over whatever is
            at the window's top left. The sidebar carries its own clearance; when
            it is collapsed the header inherits that job, or the first control
            ends up underneath them. */}
        <header
          className={`drag flex items-center gap-2 border-b border-glass-line bg-surface/40 px-3 py-2 backdrop-blur-xl sm:px-5 ${
            rail ? '' : 'pl-20 sm:pl-20'
          }`}
        >
          <button
            type="button"
            className="no-drag rounded-md p-2 text-muted hover:bg-surface lg:hidden"
            onClick={() => setDrawer(!drawer)}
            aria-label={t.app.menu}
          >
            {drawer ? <X size={16} /> : <Menu size={16} />}
          </button>
          <button
            type="button"
            className={`no-drag hidden rounded-md p-2 hover:bg-surface lg:block ${
              rail ? 'text-foreground' : 'text-muted'
            }`}
            onClick={toggleRail}
            aria-label={t.app.sidebar}
            title={t.app.sidebar}
          >
            <PanelLeft size={16} />
          </button>
          <div className="no-drag flex items-center">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={goBack}
              aria-label={t.app.back}
              title={t.app.back}
              className="rounded-md p-2 text-muted hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={!canGoForward}
              onClick={goForward}
              aria-label={t.app.forward}
              title={t.app.forward}
              className="rounded-md p-2 text-muted hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} />
            </button>
            {/* The vault changes underneath an open window: the agent writes to
                it through MCP while this is on screen. The URL carries what is
                open, and the conversation is on disk, so reloading loses
                nothing and picks all of it up. */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              aria-label={t.app.refresh}
              title={t.app.refresh}
              className="rounded-md p-2 text-muted hover:bg-surface"
            >
              <RotateCw size={15} />
            </button>
          </div>
          <button
            type="button"
            className="no-drag rounded-md p-2 text-muted hover:bg-surface"
            onClick={() => navigate('/')}
            aria-label={t.app.deck}
          >
            <ListChecks size={16} />
          </button>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="no-drag flex min-w-0 max-w-lg flex-1 items-center gap-2 rounded-lg border border-line bg-surface py-2 pl-3 pr-3 text-left text-sm text-muted hover:border-line-strong"
          >
            <Search size={14} className="shrink-0" />
            <span className="truncate">{t.app.searchPlaceholder}</span>
          </button>
          <button
            type="button"
            className={`no-drag ml-auto rounded-md p-2 hover:bg-surface ${
              chatOpen ? 'text-foreground' : 'text-muted'
            }`}
            onClick={toggleChat}
            aria-label={t.chat.screenTitle}
            title={t.chat.screenTitle}
          >
            <MessageSquare size={16} />
          </button>
        </header>

        <Tabs />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ErrorBoundary key={location.pathname} t={t}>
            <Routes>
              <Route path="/" element={<Overview data={overview} topics={topics} />} />
              <Route path="/today" element={<TodayScreen />} />
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
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/inference/:id" element={<HypothesisScreen />} />
              <Route path="*" element={<NotFoundScreen />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mounted whether or not it is showing: folding the panel away should not
          throw away what was being said in it. */}
      <aside
        className={`hidden shrink-0 overflow-hidden border-l border-glass-line transition-[width] duration-200 ease-out motion-reduce:transition-none md:block ${
          chatOpen ? 'w-96' : 'w-0 border-l-0'
        }`}
      >
        <div className="h-full w-96">
          <ChatPanel onClose={toggleChat} />
        </div>
      </aside>
    </div>
  );
};
