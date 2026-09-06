import { useEffect, useState } from 'react';
import { api, type Catalog, type ModelJob } from './api.ts';

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
  jobs: { chat: DEFAULT_CHOICE, draft: DEFAULT_CHOICE, sweep: DEFAULT_CHOICE },
};

// One store for both. The catalogue is what may be chosen and the jobs are what
// is chosen; every picker on the screen reads the same copy, and a settings
// change reaches the chat footer without a reload.
//
// Asking Claude Code what it answers to costs about three seconds, so it is
// fetched once. A failure leaves the fallback standing rather than an empty
// menu.
const catalog: { value: Catalog; asked: boolean } = { value: FALLBACK, asked: false };
const watchers = new Set<() => void>();

const tell = () => {
  for (const watch of watchers) watch();
};

const loadCatalog = () => {
  if (catalog.asked) return;
  catalog.asked = true;
  api
    .models()
    .then((next) => {
      catalog.value = next;
      tell();
    })
    .catch(() => {});
};

// Optimistic, because the row has to answer the press. The server's own answer
// replaces it, so a refused write is corrected rather than believed.
export const assignModel = (job: ModelJob, choice: Choice) => {
  catalog.value = { ...catalog.value, jobs: { ...catalog.value.jobs, [job]: choice } };
  tell();
  api
    .assignModel(job, choice)
    .then((jobs) => {
      catalog.value = { ...catalog.value, jobs };
      tell();
    })
    .catch(() => {});
};

export const chatChoice = () => catalog.value.jobs.chat;

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

// `sonnet` and `sonnet[1m]` are two `--model` values the CLI answers to, so it
// lists them as two names. They are one model at two context sizes, and a menu
// that repeats the name three times is harder to read than one that says it once
// and offers the sizes beside it.
export type ModelVariant = { model: string; label: string; tag: string | null };
export type ModelTier = { base: string; label: string; options: ModelVariant[] };

const baseOf = (model: string) => model.replace(/\[[^\]]*\]$/, '');

const tagOf = (model: string) => {
  const found = /\[([^\]]*)\]$/.exec(model);
  return found?.[1] === undefined ? null : found[1].toUpperCase();
};

// The plain name, taken from the entry that has no variant. When a CLI only ever
// offers the variant, the parenthetical the label carries is stripped instead,
// so the row still reads as a model rather than as a setting.
const tierLabel = (options: ModelVariant[]): string => {
  const plain = options.find((option) => option.tag === null);
  if (plain) return plain.label;
  const first = options[0];
  return first === undefined ? '' : first.label.replace(/\s*\([^)]*\)\s*$/, '');
};

export const groupModels = (models: { model: string; label: string }[]): ModelTier[] => {
  const order: string[] = [];
  const byBase = new Map<string, ModelVariant[]>();

  for (const entry of models) {
    const base = baseOf(entry.model);
    if (!byBase.has(base)) {
      byBase.set(base, []);
      order.push(base);
    }
    byBase.get(base)?.push({ model: entry.model, label: entry.label, tag: tagOf(entry.model) });
  }

  return order.map((base) => {
    const options = byBase.get(base) ?? [];
    return { base, label: tierLabel(options), options };
  });
};

export type Match = { provider: ProviderId; providerLabel: string; model: string; label: string };

// Typing is a way past the two levels, so it has to forgive the punctuation
// nobody remembers: `gpt56` finds GPT-5.6-Sol, `opus1m` finds Claude Opus (1M).
const loose = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const searchModels = (catalog: Catalog, query: string): Match[] => {
  const needle = loose(query);
  if (needle === '') return [];
  return catalog.providers.flatMap((provider) =>
    provider.models
      .filter((entry) => loose(`${entry.label} ${entry.model}`).includes(needle))
      .map((entry) => ({
        provider: provider.provider,
        providerLabel: provider.label,
        model: entry.model,
        label: entry.label,
      })),
  );
};
