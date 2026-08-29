import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  connectMcpClient,
  getMcpBinPath,
  type McpClientState,
  readMcpConnections,
} from '../services/mcp-clients/index.ts';

const connected = (home: string, serverPath: string, client: McpClientState) => {
  try {
    return connectMcpClient(home, serverPath, client.id) !== null;
  } catch {
    return false;
  }
};

export const registerMcp = (program: Command) => {
  const mcp = program.command('mcp').description('MCP server management');

  mcp
    .command('install')
    .description('Register the memex MCP server with every client on this machine')
    .action(() => {
      const serverPath = getMcpBinPath();

      if (!existsSync(serverPath)) {
        console.error(pc.red(`MCP binary not found at: ${serverPath}`));
        console.error(pc.dim('Run `yarn build` or reinstall the package.'));
        process.exit(1);
      }

      const home = homedir();
      const targets = readMcpConnections(home, serverPath).clients.filter(
        (client) => client.installed,
      );

      if (targets.length === 0) {
        console.error(pc.red('No MCP client found on this machine.'));
        console.error(pc.dim('Install Claude, Claude Code, Codex, or Cursor first.'));
        process.exit(1);
      }

      const outcomes = targets.map((client) => ({
        client,
        ok: connected(home, serverPath, client),
      }));

      for (const { client } of outcomes.filter(({ ok }) => ok)) {
        console.log(`${pc.green('✓')} ${client.name} ${pc.dim(client.configPath)}`);
      }

      const failures = outcomes.filter(({ ok }) => !ok);
      if (failures.length > 0) {
        console.error(
          pc.red(
            `Could not write config for: ${failures.map(({ client }) => client.name).join(', ')}.`,
          ),
        );
        process.exit(1);
      }

      console.log(pc.green('\nDone. Restart those clients to activate the memex MCP server.'));
    });

  mcp
    .command('path')
    .description('Print the MCP server binary path')
    .action(() => {
      console.log(getMcpBinPath());
    });
};
