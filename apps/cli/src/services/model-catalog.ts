import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import type { LlmProviderId } from '@memex/llm';
import { findClaudeBinary } from './claude-code/index.ts';

const run = promisify(execFile);

export type CatalogModel = { model: string; label: string; description?: string };

export type ProviderCatalog = {
  provider: LlmProviderId;
  label: string;
  source: 'cli' | 'fallback';
  models: CatalogModel[];
};

export type Catalog = { providers: ProviderCatalog[] };

// The tiers Claude Code's own picker has a row for. Doubles as the fallback,
// because these are the names it will answer to whether or not it answers.
const TIERS = ['sonnet', 'opus', 'haiku', 'fable'];

// `/model` answers in prose, so this reads the one sentence that carries the
// list. An alias never has a space in it, which is what separates the names
// from the "or a full model ID" the sentence ends on.
export const claudeAliases = (result: string): string[] => {
  const sentence = /Available:\s*([^.]+)/.exec(result);
  if (sentence === null) return [];
  return sentence[1]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '' && !name.includes(' '));
};

const base = (alias: string) => alias.replace(/\[.*\]$/, '');

// `/model` in print mode answers with what the `--model` flag accepts, which is
// not the menu: `best`, `opusplan` and `default` are routing policies, and the
// interactive picker has no row for any of them. A row is a model — a tier, or
// a context variant of one. A tier nobody has heard of yet is admitted by its
// own variant, so this does not have to be taught about the next one.
export const menuAliases = (aliases: string[]): string[] => {
  const varied = new Set(
    aliases.filter((alias) => alias !== base(alias)).map((alias) => base(alias)),
  );
  return aliases.filter((alias) => TIERS.includes(base(alias)) || varied.has(base(alias)));
};

const CLAUDE_NAMES: Record<string, string> = {
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
  haiku: 'Claude Haiku',
  fable: 'Claude Fable',
};

export const claudeLabel = (alias: string): string => {
  const tier = base(alias);
  const name = CLAUDE_NAMES[tier] ?? tier.charAt(0).toUpperCase() + tier.slice(1);
  const variant = alias.slice(tier.length).replace(/^\[|\]$/g, '');
  return variant === '' ? name : `${name} (${variant.toUpperCase()})`;
};

type RawCodexModel = {
  slug?: unknown;
  display_name?: unknown;
  description?: unknown;
  visibility?: unknown;
  priority?: unknown;
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

// `visibility` is the CLI's own word for what its picker shows: `gpt-reserve`
// and `codex-auto-review` are marked `hide` and are not models a person picks.
// Anything that is not hidden is listed, so a value nobody has seen yet shows
// up rather than disappearing.
export const codexModels = (stdout: string): CatalogModel[] => {
  const parsed: unknown = JSON.parse(stdout);
  const models = (parsed as { models?: unknown })?.models;
  if (!Array.isArray(models)) return [];

  return models
    .map((entry) => entry as RawCodexModel)
    .filter((entry) => text(entry.slug) !== undefined && entry.visibility !== 'hide')
    .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0))
    .map((entry) => ({
      model: String(entry.slug),
      label: text(entry.display_name) ?? String(entry.slug),
      ...(text(entry.description) === undefined ? {} : { description: String(entry.description) }),
    }));
};

const CLI_TIMEOUT_MS = 15_000;

const askClaudeForModels = async (home: string, pathEnv: string): Promise<string[]> => {
  const binary = findClaudeBinary(home, pathEnv);
  if (binary === null) return [];
  try {
    const { stdout } = await run(binary, ['-p', '/model', '--output-format', 'json'], {
      timeout: CLI_TIMEOUT_MS,
    });
    const envelope: unknown = JSON.parse(stdout);
    return claudeAliases(text((envelope as { result?: unknown })?.result) ?? '');
  } catch {
    return [];
  }
};

const askCodexForModels = async (): Promise<CatalogModel[]> => {
  try {
    const { stdout } = await run('codex', ['debug', 'models'], { timeout: CLI_TIMEOUT_MS });
    return codexModels(stdout);
  } catch {
    return [];
  }
};

const readClaudeCatalog = async (home: string, pathEnv: string): Promise<ProviderCatalog> => {
  const answered = menuAliases(await askClaudeForModels(home, pathEnv));
  const names = answered.length > 0 ? answered : TIERS;
  return {
    provider: 'claude-code',
    label: 'Claude Code',
    source: answered.length > 0 ? 'cli' : 'fallback',
    models: names.map((alias) => ({ model: alias, label: claudeLabel(alias) })),
  };
};

// No fallback list, because there is nothing to fall back to: Codex model names
// are not a set memex can guess, and a guessed one is a call that fails. An
// empty group still takes a typed-in name.
const readCodexCatalog = async (): Promise<ProviderCatalog> => {
  const models = await askCodexForModels();
  return {
    provider: 'codex',
    label: 'Codex (ChatGPT)',
    source: models.length > 0 ? 'cli' : 'fallback',
    models,
  };
};

const TTL_MS = 5 * 60_000;

// Asking Claude Code takes about three seconds, which is a long time to hold a
// screen that only wants to draw a menu. The window is short because the answer
// changes when the person signs in somewhere else or the CLI updates itself.
const cache: { at: number; value: Catalog | null } = { at: 0, value: null };

export const readCatalog = async (
  home = homedir(),
  pathEnv = process.env.PATH ?? '',
  now = Date.now(),
): Promise<Catalog> => {
  if (cache.value !== null && now - cache.at < TTL_MS) return cache.value;

  const providers = await Promise.all([readClaudeCatalog(home, pathEnv), readCodexCatalog()]);
  const value = { providers };
  cache.at = now;
  cache.value = value;
  return value;
};
