import type { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig, saveConfig, expandPath } from '@memex/utils';

export const registerConfig = (program: Command) => {
  const config = program.command('config').description('Manage memex configuration');

  config
    .command('set vault-path <path>')
    .description('Set the vault path')
    .action((path: string) => {
      const resolved = expandPath(path);
      const current = loadConfig();
      saveConfig({ ...current, vault_path: resolved });
      console.log(pc.green(`Vault path set to: ${resolved}`));
    });

  config
    .command('show')
    .description('Show current configuration')
    .action(() => {
      const current = loadConfig();
      console.log(pc.bold('vault_path:'), current.vault_path);
    });
};
