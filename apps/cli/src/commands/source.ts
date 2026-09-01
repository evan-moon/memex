import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { deleteNote, listNotesByPathPrefix, openDb } from '@memex/db';
import { CONFIG_DIR, expandPath, loadConfig, saveConfig } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { isCoveredByAny } from '../services/sources.ts';

export const registerSource = (program: Command) => {
  const source = program.command('source').description('Manage indexed sources');

  source
    .command('add <path>')
    .description('Add a directory to index')
    .action((inputPath: string) => {
      const resolved = resolve(expandPath(inputPath));
      if (!existsSync(resolved)) {
        console.error(pc.red(`Directory not found: ${resolved}`));
        process.exit(1);
      }

      const config = loadConfig();
      if (config.sources.some((s) => s.path === resolved)) {
        console.log(pc.dim(`Already added: ${resolved}`));
        return;
      }

      config.sources.push({ path: resolved });
      saveConfig(config);
      console.log(pc.green(`Added source: ${resolved}`));
      console.log(pc.dim('Run `memex index` to index it.'));
    });

  source
    .command('list')
    .description('List all sources')
    .action(() => {
      const config = loadConfig();
      const vaultPath = expandPath(config.vault_path);

      console.log(`${pc.bold('vault')}  ${vaultPath}`);
      if (config.sources.length === 0) {
        console.log(pc.dim('No additional sources.'));
        return;
      }
      for (const s of config.sources) {
        console.log(`${pc.bold('source')} ${s.path}`);
      }
    });

  source
    .command('remove <path>')
    .description('Remove a source')
    .action((inputPath: string) => {
      const resolved = resolve(expandPath(inputPath));
      const config = loadConfig();
      const before = config.sources.length;
      config.sources = config.sources.filter((s) => s.path !== resolved);

      if (config.sources.length === before) {
        console.error(pc.red(`Source not found: ${resolved}`));
        process.exit(1);
      }

      saveConfig(config);

      const remainingRoots = [
        expandPath(config.vault_path),
        ...config.sources.map((s) => s.path),
      ];
      const client = openDb(CONFIG_DIR);
      const orphaned = listNotesByPathPrefix(client, resolved).filter(
        (note) => !isCoveredByAny(note.filePath, remainingRoots),
      );
      for (const note of orphaned) deleteNote(client, note.id);

      console.log(pc.green(`Removed source: ${resolved}`));
      console.log(
        pc.dim(
          orphaned.length === 0
            ? 'No notes were indexed from it alone.'
            : `Forgot ${String(orphaned.length)} note(s) indexed from it. The files were left alone.`,
        ),
      );
    });
};
