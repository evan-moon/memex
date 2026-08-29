import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { openDb } from '@memex/db';
import { createLazyEmbedder } from '@memex/embed';
import { CONFIG_DIR, expandPath, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';
import { getMcpBinPath } from '../services/mcp-clients/index.ts';
import { startUiServer } from '../services/ui/server.ts';
import { createShapeFiller } from '../services/ui/shapes.ts';

export const registerUi = (program: Command) => {
  program
    .command('ui')
    .description('Browse the vault by topic, and see which notes were later corrected')
    .option('-p, --port <n>', 'Port to listen on', '4321')
    .option('--no-open', 'Print the URL instead of opening a browser')
    .action(async (opts: { port: string; open: boolean }) => {
      const client = openDb(CONFIG_DIR);
      guardEmbeddingModel(client);
      const vaultPath = expandPath(loadConfig().vault_path);
      // Loaded on the first search rather than now: the port may be taken, and
      // exiting with the model's native threads already running aborts the
      // process instead of printing why.
      const embedder = createLazyEmbedder(MODEL_CACHE_DIR);

      try {
        const shapes = createShapeFiller({ client });
        const url = await startUiServer(
          {
            client,
            embedder,
            vaultPath,
            mcp: { home: homedir(), serverPath: getMcpBinPath() },
            fillShapes: shapes.fill,
          },
          Number(opts.port),
        );
        console.log(`${pc.green('✓')} memex at ${pc.bold(url)}  ${pc.dim('(ctrl-c to stop)')}`);
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
