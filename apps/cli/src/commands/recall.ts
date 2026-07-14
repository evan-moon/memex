import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  type ClaudeSettings,
  hasRecallHooks,
  withoutRecallHooks,
  withRecallHooks,
} from '../services/recall/hooks.ts';

const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

const getRecallBinPath = () => join(dirname(fileURLToPath(import.meta.url)), 'recall.js');

const readSettings = (): ClaudeSettings => {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8')) as ClaudeSettings;
  } catch {
    console.error(pc.red(`Could not parse ${CLAUDE_SETTINGS_PATH}. Fix the JSON and retry.`));
    process.exit(1);
  }
};

const writeSettings = (settings: ClaudeSettings) => {
  mkdirSync(dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
  writeFileSync(CLAUDE_SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
};

export const registerRecall = (program: Command) => {
  const recall = program
    .command('recall')
    .description('Auto-recall: inject relevant notes into Claude Code on every prompt');

  recall
    .command('install')
    .description('Register the auto-recall hook with Claude Code')
    .action(() => {
      const binPath = getRecallBinPath();

      if (!existsSync(binPath)) {
        console.error(pc.red(`Recall binary not found at: ${binPath}`));
        console.error(pc.dim('Run `memex build` or reinstall the package.'));
        process.exit(1);
      }

      writeSettings(withRecallHooks(readSettings(), binPath));

      console.log(pc.green('Auto-recall installed.'));
      console.log(pc.dim(`  hooks   ${CLAUDE_SETTINGS_PATH}`));
      console.log(
        pc.dim(
          '  cost    ~200MB resident while the daemon is warm, and up to 3 note titles of context per prompt',
        ),
      );
      console.log(pc.dim('  remove  memex recall uninstall'));
      console.log(pc.green('\nRestart Claude Code to activate.'));
    });

  recall
    .command('uninstall')
    .description('Remove the auto-recall hook from Claude Code')
    .action(() => {
      const settings = readSettings();

      if (!hasRecallHooks(settings)) {
        console.log(pc.dim('Auto-recall is not installed.'));
        return;
      }

      writeSettings(withoutRecallHooks(settings));
      console.log(pc.green('Auto-recall removed. Restart Claude Code to apply.'));
    });
};
