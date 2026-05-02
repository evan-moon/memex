import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.memex');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DEFAULT_VAULT_PATH = join(homedir(), 'Documents', 'Second Brain');

export type MemexConfig = {
  vault_path: string;
};

export const MODEL_CACHE_DIR = join(CONFIG_DIR, 'models');

export const expandPath = (p: string): string =>
  p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;

export const loadConfig = (): MemexConfig => {
  if (!existsSync(CONFIG_PATH)) return { vault_path: DEFAULT_VAULT_PATH };
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as MemexConfig;
  } catch {
    return { vault_path: DEFAULT_VAULT_PATH };
  }
};

export const saveConfig = (config: MemexConfig): void => {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
};
