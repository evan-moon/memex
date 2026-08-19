import { useEffect, useState } from 'react';
import { api, type Sidebar as SidebarData, type Topic } from './api.ts';
import { go, useRoute } from './route.ts';
import { Sidebar } from './Sidebar.tsx';
import { Home, NoteScreen, SearchScreen, TopicScreen } from './screens.tsx';

export const App = () => {
  const route = useRoute();
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    Promise.all([api.sidebar(), api.topics()]).then(([s, t]) => {
      setSidebar(s);
      setTopics(t);
    });
  }, []);

  useEffect(() => {
    if (route.name === 'search') setQuery(route.q);
  }, [route]);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(query.trim().length === 0 ? { name: 'home' } : { name: 'search', q: query.trim() });
  };

  if (!sidebar || !topics) return <div className="loading" style={{ padding: 40 }}>…</div>;

  return (
    <div className="shell">
      <Sidebar data={sidebar} topics={topics} route={route} />
      <div className="main">
        <form className="top" onSubmit={submit}>
          {route.name !== 'home' ? (
            <span className="back" onClick={() => window.history.back()}>
              ← 뒤로
            </span>
          ) : null}
          <input
            id="q"
            value={query}
            placeholder="검색  (⌘K)"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        <div className="body">
          {route.name === 'home' ? <Home topics={topics} /> : null}
          {route.name === 'topic' ? <TopicScreen tag={route.tag} /> : null}
          {route.name === 'note' ? <NoteScreen id={route.id} /> : null}
          {route.name === 'search' ? <SearchScreen q={route.q} /> : null}
        </div>
      </div>
    </div>
  );
};
