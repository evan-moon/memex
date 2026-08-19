import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'topic'; tag: string }
  | { name: 'note'; id: number }
  | { name: 'search'; q: string };

// Hash routing keeps the server a static file server and gives back the two
// things innerHTML swapping never had: a back button, and a URL that says
// where you are.
export const parse = (hash: string): Route => {
  const [, kind, rest] = hash.replace(/^#\/?/, '/').split('/');
  if (kind === 'topic' && rest) return { name: 'topic', tag: decodeURIComponent(rest) };
  if (kind === 'note' && rest) return { name: 'note', id: Number(rest) };
  if (kind === 'search' && rest) return { name: 'search', q: decodeURIComponent(rest) };
  return { name: 'home' };
};

export const href = (route: Route): string => {
  if (route.name === 'topic') return `#/topic/${encodeURIComponent(route.tag)}`;
  if (route.name === 'note') return `#/note/${route.id}`;
  if (route.name === 'search') return `#/search/${encodeURIComponent(route.q)}`;
  return '#/';
};

export const go = (route: Route) => {
  window.location.hash = href(route);
};

export const useRoute = (): Route => {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
};
