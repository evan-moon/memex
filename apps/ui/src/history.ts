import { useSyncExternalStore } from 'react';

type Nav = {
  canGoBack: boolean;
  canGoForward: boolean;
  back: () => void;
  forward: () => void;
  addEventListener: (type: string, listen: () => void) => void;
  removeEventListener: (type: string, listen: () => void) => void;
};

// Chromium's Navigation API, which is the only thing that answers "is there
// anywhere to go back to". `history.length` counts the whole session including
// entries ahead of you, so a disabled state built on it lies in both directions.
const nav = (): Nav | null =>
  typeof window !== 'undefined' && 'navigation' in window
    ? (window.navigation as unknown as Nav)
    : null;

const subscribe = (listen: () => void) => {
  const api = nav();
  api?.addEventListener('navigatesuccess', listen);
  api?.addEventListener('currententrychange', listen);
  return () => {
    api?.removeEventListener('navigatesuccess', listen);
    api?.removeEventListener('currententrychange', listen);
  };
};

const read = () => {
  const api = nav();
  // Without the API nothing is greyed out — a button that might work beats a
  // button that is disabled because we could not tell.
  return api === null ? 0b11 : (api.canGoBack ? 0b10 : 0) | (api.canGoForward ? 0b01 : 0);
};

export const goBack = () => nav()?.back();

export const goForward = () => nav()?.forward();

export const useHistory = () => {
  const bits = useSyncExternalStore(subscribe, read, () => 0b11);
  return { canGoBack: (bits & 0b10) !== 0, canGoForward: (bits & 0b01) !== 0 };
};
