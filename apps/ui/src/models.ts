import { useSyncExternalStore } from 'react';

export type ProviderId = 'claude-code' | 'codex';

export type Choice = { provider: ProviderId; model: string };

export type ModelOption = Choice & { label: string };

// What the two CLIs will actually answer to. Codex has no entry per model
// because its list belongs to the account, not to memex: sending no `--model`
// asks for whatever that account is set to.
export const MODELS: ModelOption[] = [
  { provider: 'claude-code', model: 'sonnet', label: 'Claude Sonnet' },
  { provider: 'claude-code', model: 'opus', label: 'Claude Opus' },
  { provider: 'claude-code', model: 'haiku', label: 'Claude Haiku' },
  { provider: 'codex', model: '', label: 'ChatGPT (Codex)' },
];

export const DEFAULT_CHOICE: Choice = { provider: 'claude-code', model: 'sonnet' };

const KEY = 'memex-model';

const same = (a: Choice, b: Choice) => a.provider === b.provider && a.model === b.model;

export const labelOf = (choice: Choice) =>
  MODELS.find((option) => same(option, choice))?.label ?? choice.model;

const read = (): Choice => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_CHOICE;
    const parsed = JSON.parse(raw) as Choice;
    return MODELS.some((option) => same(option, parsed)) ? parsed : DEFAULT_CHOICE;
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
