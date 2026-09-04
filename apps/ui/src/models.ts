import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, type Catalog } from './api.ts';

export type ProviderId = 'claude-code' | 'codex';

export type Choice = { provider: ProviderId; model: string };

export type ModelOption = Choice & { label: string };

export const DEFAULT_CHOICE: Choice = { provider: 'claude-code', model: 'sonnet' };

// What memex can name without asking anyone. Both CLIs can be asked what they
// will answer to — `/model` and `codex debug models` — and the server does ask,
// so this is only what the picker draws while that is in flight or when neither
// CLI is there to answer. Codex has no entry here because its model names are
// not a set that can be guessed, and a guessed one is a call that fails.
const FALLBACK: Catalog = {
  providers: [
    {
      provider: 'claude-code',
      label: 'Claude Code',
      source: 'fallback',
      models: [
        { model: 'sonnet', label: 'Claude Sonnet' },
        { model: 'opus', label: 'Claude Opus' },
        { model: 'haiku', label: 'Claude Haiku' },
        { model: 'fable', label: 'Claude Fable' },
      ],
    },
    { provider: 'codex', label: 'Codex (ChatGPT)', source: 'fallback', models: [] },
  ],
};

const KEY = 'memex-model';

const read = (): Choice => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_CHOICE;
    const parsed = JSON.parse(raw) as Choice;
    const known = parsed.provider === 'claude-code' || parsed.provider === 'codex';
    return known && parsed.model !== '' ? parsed : DEFAULT_CHOICE;
  } catch {
    return DEFAULT_CHOICE;
  }
};

// The default is what a new conversation starts on; the panel's own picker
// changes this conversation without changing that. A store rather than
// component state, because the settings page and the panel are both looking at
// it and neither owns the other.
const listeners = new Set<() => void>();
const state = { choice: read() };

export const setDefaultChoice = (choice: Choice) => {
  state.choice = choice;
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // Storage turned off means the default is forgotten between launches, which
    // is a worse memory rather than a broken app.
  }
  for (const listen of listeners) listen();
};

export const defaultChoice = () => state.choice;

const subscribe = (listen: () => void) => {
  listeners.add(listen);
  return () => listeners.delete(listen);
};

export const useDefaultChoice = () => useSyncExternalStore(subscribe, () => state.choice);

// Asking Claude Code what it answers to costs about three seconds, so the
// answer is fetched once and shared. Every picker on the screen reads the same
// one, and a failure leaves the fallback standing rather than an empty menu.
const catalog: { value: Catalog; asked: boolean } = { value: FALLBACK, asked: false };
const watchers = new Set<() => void>();

const loadCatalog = () => {
  if (catalog.asked) return;
  catalog.asked = true;
  api
    .models()
    .then((next) => {
      catalog.value = next;
      for (const watch of watchers) watch();
    })
    .catch(() => {});
};

export const useCatalog = (): Catalog => {
  const [value, setValue] = useState(catalog.value);
  useEffect(() => {
    const watch = () => setValue(catalog.value);
    watchers.add(watch);
    loadCatalog();
    watch();
    return () => {
      watchers.delete(watch);
    };
  }, []);
  return value;
};
