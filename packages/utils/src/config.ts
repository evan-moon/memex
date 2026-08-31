import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';

export const CONFIG_DIR = join(homedir(), '.memex');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DEFAULT_VAULT_PATH = join(homedir(), 'Documents', 'Second Brain');

export type MemexSource = {
  path: string;
};

export type MemexConfig = {
  vault_path: string;
  sources: MemexSource[];
  // When the person finished setting the app up, not when it was installed. A
  // missing file and a file written by the CLI both read as "not yet", which is
  // what the app wants: the only thing that clears the door is having walked
  // through it.
  onboarded_at: string | null;
};

export const MODEL_CACHE_DIR = join(CONFIG_DIR, 'models');

export const expandPath = (p: string): string =>
  p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;

const DEFAULT_CONFIG: MemexConfig = {
  vault_path: DEFAULT_VAULT_PATH,
  sources: [],
  onboarded_at: null,
};

export const loadConfig = (): MemexConfig => {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<MemexConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
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
