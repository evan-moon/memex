import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';

export const CONFIG_DIR = join(homedir(), '.memex');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DEFAULT_VAULT_PATH = join(homedir(), 'Documents', 'Second Brain');

export type MemexSource = {
  path: string;
};

// Which model does which kind of work, split by who is waiting: a turn someone
// is watching, a draft they will be asked to approve, and a sweep nobody is
// waiting on at all.
//
// This lives in the config file rather than in the browser, because two of the
// three run where a browser does not: `claim-extract` in the app host and
// `conflicts` in the CLI.
export type ModelJob = 'chat' | 'draft' | 'sweep';

// Structural on purpose. Which providers exist is the LLM layer's business, and
// utils does not depend on it; the CLI narrows this with its own guard.
export type ModelChoice = { provider: string; model: string };

export const MODEL_JOBS: readonly ModelJob[] = ['chat', 'draft', 'sweep'];

export type MemexConfig = {
  vault_path: string;
  sources: MemexSource[];
  models: Record<ModelJob, ModelChoice>;
  // When the person finished setting the app up, not when it was installed. A
  // missing file and a file written by the CLI both read as "not yet", which is
  // what the app wants: the only thing that clears the door is having walked
  // through it.
  onboarded_at: string | null;
};

export const MODEL_CACHE_DIR = join(CONFIG_DIR, 'models');

export const expandPath = (p: string): string =>
  p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;

// What every job did before there was a way to say otherwise. A vault whose
// config predates this reads exactly as it did.
const DEFAULT_MODEL: ModelChoice = { provider: 'claude-code', model: 'sonnet' };

const DEFAULT_MODELS: Record<ModelJob, ModelChoice> = {
  chat: DEFAULT_MODEL,
  draft: DEFAULT_MODEL,
  sweep: DEFAULT_MODEL,
};

const DEFAULT_CONFIG: MemexConfig = {
  vault_path: DEFAULT_VAULT_PATH,
  sources: [],
  models: DEFAULT_MODELS,
  onboarded_at: null,
};

// An empty model would mean "whatever the CLI is set to", which memex decided
// against: it names the model on every call. So a half-written entry is not a
// choice, and the job keeps the default rather than inheriting a blank.
const asChoice = (value: unknown): ModelChoice | null => {
  const asked = value as { provider?: unknown; model?: unknown } | null;
  return typeof asked?.provider === 'string' &&
    asked.provider !== '' &&
    typeof asked.model === 'string' &&
    asked.model !== ''
    ? { provider: asked.provider, model: asked.model }
    : null;
};

export const readModels = (stored: unknown): Record<ModelJob, ModelChoice> => {
  const asked = (stored ?? {}) as Record<string, unknown>;
  return MODEL_JOBS.reduce(
    (models, job) => ({ ...models, [job]: asChoice(asked[job]) ?? DEFAULT_MODELS[job] }),
    {} as Record<ModelJob, ModelChoice>,
  );
};

export const loadConfig = (): MemexConfig => {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<MemexConfig>;
    return { ...DEFAULT_CONFIG, ...parsed, models: readModels(parsed.models) };
  } catch {
    return DEFAULT_CONFIG;
  }
};

export const saveConfig = (config: MemexConfig): void => {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
};

// The vault is the one place memex owns. A file indexed from anywhere else is
// borrowed: memex reads it, and the tool that wrote it will write it again.
export const inVault = (filePath: string, vault: string): boolean =>
  filePath.startsWith(vault.endsWith(sep) ? vault : `${vault}${sep}`);
