import { useSyncExternalStore } from 'react';
import { api } from './api.ts';
import {
  type ResolvedTheme,
  readThemePreference,
  resolveTheme,
  type ThemePreference,
} from './theme-preference.ts';

export type Theme = ThemePreference;

const KEY = 'memex-theme';

const systemTheme = (): ResolvedTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const stored = () => readThemePreference(localStorage.getItem(KEY));

const listeners = new Set<() => void>();
const state = { current: resolveTheme(stored(), systemTheme()) };

const apply = (theme: ResolvedTheme) => {
  document.documentElement.dataset.theme = theme;
  api.setAppearance(theme).catch(() => {});
};

apply(state.current.resolved);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.current.preference !== 'system') return;
  state.current = resolveTheme('system', systemTheme());
  apply(state.current.resolved);
  listeners.forEach((listen) => {
    listen();
  });
});

export const setTheme = (theme: Theme) => {
  const next = resolveTheme(theme, systemTheme());
  if (state.current.preference === next.preference && state.current.resolved === next.resolved)
    return;
  state.current = next;
  localStorage.setItem(KEY, theme);
  apply(next.resolved);
  listeners.forEach((listen) => {
    listen();
  });
};

const subscribe = (listen: () => void) => {
  listeners.add(listen);
  return () => listeners.delete(listen);
};

export const useTheme = () =>
  useSyncExternalStore(
    subscribe,
    () => state.current.preference,
    () => state.current.preference,
  );
