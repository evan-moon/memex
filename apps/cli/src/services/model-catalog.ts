import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { LlmProviderId } from '@memex/llm';
import { findClaudeBinary } from './claude-code/index.ts';

const run = promisify(execFile);

export type CatalogModel = { model: string; label: string; description?: string };

export type ProviderCatalog = {
  provider: LlmProviderId;
  label: string;
  source: 'cli' | 'fallback';
  configured: string | null;
  models: CatalogModel[];
};

export type Catalog = { providers: ProviderCatalog[] };

const CLAUDE_FALLBACK = ['sonnet', 'opus', 'haiku', 'fable'];

const ACCOUNT_DEFAULT: CatalogModel = { model: '', label: 'Account default' };

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

const CLAUDE_NAMES: Record<string, string> = {
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
  haiku: 'Claude Haiku',
  fable: 'Claude Fable',
};

export const claudeLabel = (alias: string): string => {
  const long = alias.endsWith('[1m]');
  const base = long ? alias.slice(0, -'[1m]'.length) : alias;
  const name = CLAUDE_NAMES[base] ?? base.charAt(0).toUpperCase() + base.slice(1);
  return long ? `${name} (1M)` : name;
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

// Only the keys above the first table are the file's own; `model` appears again
// under a `[projects.…]` section and means something else there.
export const tomlTopLevel = (source: string, key: string): string | null => {
  const head = source.split(/^\[/m)[0];
  const found = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(head);
  return found === null ? null : found[1];
};

const readFile = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

const configuredClaude = (home: string): string | null => {
  const source = readFile(join(home, '.claude', 'settings.json'));
  if (source === null) return null;
  try {
    const parsed: unknown = JSON.parse(source);
    return text((parsed as { model?: unknown })?.model) ?? null;
  } catch {
    return null;
  }
};

const configuredCodex = (home: string): string | null => {
  const source = readFile(join(home, '.codex', 'config.toml'));
  return source === null ? null : tomlTopLevel(source, 'model');
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
  const aliases = await askClaudeForModels(home, pathEnv);
  const names = aliases.length > 0 ? aliases : CLAUDE_FALLBACK;
  return {
    provider: 'claude-code',
    label: 'Claude Code',
    source: aliases.length > 0 ? 'cli' : 'fallback',
    configured: configuredClaude(home),
    models: names.map((alias) => ({ model: alias, label: claudeLabel(alias) })),
  };
};

// Sending no `--model` asks for whatever the account is set to, which stays the
// first option even once the catalogue is known: it is the one choice that
// cannot go stale.
const readCodexCatalog = async (home: string): Promise<ProviderCatalog> => {
  const models = await askCodexForModels();
  return {
    provider: 'codex',
    label: 'Codex (ChatGPT)',
    source: models.length > 0 ? 'cli' : 'fallback',
    configured: configuredCodex(home),
    models: [ACCOUNT_DEFAULT, ...models],
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

  const providers = await Promise.all([readClaudeCatalog(home, pathEnv), readCodexCatalog(home)]);
  const value = { providers };
  cache.at = now;
  cache.value = value;
  return value;
};
