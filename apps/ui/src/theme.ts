import { useSyncExternalStore } from 'react';
import { api } from './api.ts';

export type Theme = 'light' | 'dark';

const KEY = 'memex-theme';

const systemTheme = (): Theme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const stored = () => {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
};

// A store rather than component state: the toggle lives on the settings page and
// the theme has to hold whether that page is mounted or not.
const listeners = new Set<() => void>();
const state = { theme: stored() ?? systemTheme() };

// The glass behind the page belongs to the window, and the window follows the OS
// unless told otherwise. Without this a light theme is drawn on dark material.
const apply = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  api.setAppearance(theme).catch(() => {});
};

apply(state.theme);

// Follow the OS until someone states a preference of their own.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (stored() === null) setTheme(systemTheme());
});

export const setTheme = (theme: Theme) => {
  if (state.theme === theme) return;
  state.theme = theme;
  localStorage.setItem(KEY, theme);
  apply(theme);
  for (const listen of listeners) listen();
};

const subscribe = (listen: () => void) => {
  listeners.add(listen);
  return () => listeners.delete(listen);
};

export const useTheme = () => useSyncExternalStore(subscribe, () => state.theme);
