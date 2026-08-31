import { existsSync, mkdirSync } from 'node:fs';
import { expandPath, loadConfig, saveConfig } from '@memex/utils';

export type OnboardingState = {
  onboardedAt: string | null;
  vaultPath: string;
  vaultExists: boolean;
  // Whether this host can open a real folder chooser. The app can; a browser
  // pointed at the same routes cannot, and typing a path is what it falls back
  // to rather than the screen offering a button that does nothing.
  canPickFolder: boolean;
};

export const readOnboarding = (canPickFolder: boolean): OnboardingState => {
  const { vault_path, onboarded_at } = loadConfig();
  const vaultPath = expandPath(vault_path);
  return {
    onboardedAt: onboarded_at,
    vaultPath,
    vaultExists: existsSync(vaultPath),
    canPickFolder,
  };
};

// Choosing where the vault goes and having it be there are the same step: a
// folder the person picked and that does not exist yet is not a decision they
// should have to make twice.
export const chooseVault = (path: string, canPickFolder: boolean): OnboardingState => {
  mkdirSync(expandPath(path), { recursive: true });
  saveConfig({ ...loadConfig(), vault_path: path });
  return readOnboarding(canPickFolder);
};

export const finishOnboarding = (at: string, canPickFolder: boolean): OnboardingState => {
  saveConfig({ ...loadConfig(), onboarded_at: at });
  return readOnboarding(canPickFolder);
};
