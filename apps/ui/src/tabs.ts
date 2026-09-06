import { useSyncExternalStore } from 'react';

export type Tab = { id: number; title: string };

const KEY = 'memex-tabs';

// Which notes are open, and which one is showing. The route still says what is
// on screen — this is the list of what you could go back to without finding it
// again, which is the whole of what a tab is.
type State = { tabs: Tab[]; active: number | null };

const read = (): State => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return { tabs: [], active: null };
    const parsed = JSON.parse(raw) as State;
    return Array.isArray(parsed.tabs) ? parsed : { tabs: [], active: null };
  } catch {
    return { tabs: [], active: null };
  }
};

const listeners = new Set<() => void>();
const state = { current: read() };

const commit = (next: State) => {
  state.current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage turned off loses the tabs between launches, which is a worse
    // memory rather than a broken app.
  }
  for (const listen of listeners) listen();
};

// Opening a note that is already open moves to it rather than opening a second
// copy — the same thing twice is not two places to be.
//
// Everything else is kept. An open that replaced where you were meant the strip
// could only ever hold one note, which is a worse address bar rather than a set
// of places to be. `background` opens without leaving the note being read.
export const openTab = (tab: Tab, { background = false } = {}) => {
  const { tabs, active } = state.current;
  const at = tabs.findIndex((open) => open.id === tab.id);
  if (at !== -1) {
    commit({
      tabs: tabs.map((open, n) => (n === at ? tab : open)),
      active: background ? active : tab.id,
    });
    return;
  }
  commit({ tabs: [...tabs, tab], active: background ? (active ?? tab.id) : tab.id });
};

export const closeTab = (id: number) => {
  const { tabs, active } = state.current;
  const at = tabs.findIndex((open) => open.id === id);
  if (at === -1) return;
  const next = tabs.filter((open) => open.id !== id);
  // Closing the one you are on lands you on its neighbour, the way every tabbed
  // thing does — never on nothing while others are still open.
  const nowActive =
    active === id ? (next[Math.min(at, next.length - 1)]?.id ?? null) : (active ?? null);
  commit({ tabs: next, active: nowActive });
};

export const activateTab = (id: number) => commit({ ...state.current, active: id });

const subscribe = (listen: () => void) => {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
};

export const useTabs = () => useSyncExternalStore(subscribe, () => state.current);

export const tabsNow = (): State => state.current;
