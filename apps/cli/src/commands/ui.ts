import { spawn } from 'node:child_process';
import { openDb, refreshSignals } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { startUiServer } from '../services/ui/server.ts';

export const registerUi = (program: Command) => {
  program
    .command('ui')
    .description('Open the signal inbox in a browser — triage what memex noticed')
    .option('-p, --port <n>', 'Port to listen on', '4321')
    .option('--no-open', 'Print the URL instead of opening a browser')
    .action(async (opts: { port: string; open: boolean }) => {
      const client = openDb(CONFIG_DIR);
      refreshSignals(client);

      try {
        const url = await startUiServer(client, Number(opts.port));
        console.log(
          `${pc.green('✓')} memex inbox at ${pc.bold(url)}  ${pc.dim('(ctrl-c to stop)')}`,
        );
        if (opts.open) spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
      } catch (err) {
        const inUse = err instanceof Error && 'code' in err && err.code === 'EADDRINUSE';
        console.error(
          pc.red(
            inUse
              ? `Port ${opts.port} is taken — pass --port to pick another.`
              : `Could not start: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exit(1);
      }
    });
};
