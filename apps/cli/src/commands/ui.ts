import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { startMemexHost } from '../services/ui/host.ts';

export const registerUi = (program: Command) => {
  program
    .command('ui')
    .description('Browse the vault by topic, and see which notes were later corrected')
    .option('-p, --port <n>', 'Port to listen on', '4321')
    .option('--no-open', 'Print the URL instead of opening a browser')
    .action(async (opts: { port: string; open: boolean }) => {
      try {
        const { url } = await startMemexHost(Number(opts.port));
        console.log(
          `${pc.green('\u2713')} memex at ${pc.bold(url)}  ${pc.dim('(ctrl-c to stop)')}`,
        );
        if (opts.open) spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
      } catch (err) {
        const inUse = err instanceof Error && 'code' in err && err.code === 'EADDRINUSE';
        console.error(
          pc.red(
            inUse
              ? `Port ${opts.port} is taken \u2014 pass --port to pick another.`
              : `Could not start: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exit(1);
      }
    });
};
