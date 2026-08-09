import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import pc from 'picocolors';

export const getMcpBinPath = (): string => {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const workspaceMcpPaths = [
    join(cliDir, '../../mcp/dist/index.js'),
    join(cliDir, '../../../mcp/dist/index.js'),
  ];
  const workspaceMcpPath = workspaceMcpPaths.find((path) => existsSync(path));
  if (workspaceMcpPath) return workspaceMcpPath;

  return join(cliDir, 'mcp.js');
};

type McpClient = 'claude' | 'codex';
type RunClient = (client: McpClient, args: string[]) => void;

type McpInstallResult = {
  failures: Array<{ client: McpClient; error: unknown }>;
};

const runClient: RunClient = (client, args) => {
  execFileSync(client, args, { stdio: 'inherit' });
};

export const installMcpClients = (
  mcpPath: string,
  run: RunClient = runClient,
): McpInstallResult => {
  const failures: McpInstallResult['failures'] = [];
  const args = ['mcp', 'add', 'memex', '--', 'node', mcpPath];

  try {
    run('claude', ['mcp', 'remove', 'memex', '-s', 'local']);
  } catch {
    // `remove` fails when this is the first installation; that is expected.
  }

  for (const client of ['claude', 'codex'] as const) {
    try {
      run(client, args);
    } catch (error) {
      failures.push({ client, error });
    }
  }

  return { failures };
};

export const registerMcp = (program: Command) => {
  const mcp = program.command('mcp').description('MCP server management');

  mcp
    .command('install')
    .description('Register memex MCP server with Claude Code and Codex')
    .action(() => {
      const mcpPath = getMcpBinPath();

      if (!existsSync(mcpPath)) {
        console.error(pc.red(`MCP binary not found at: ${mcpPath}`));
        console.error(pc.dim('Run `memex build` or reinstall the package.'));
        process.exit(1);
      }

      const { failures } = installMcpClients(mcpPath);

      if (failures.length > 0) {
        console.error(
          pc.red(
            `Failed to register MCP server with: ${failures.map(({ client }) => client).join(', ')}.`,
          ),
        );
        for (const { client } of failures) {
          console.error(
            pc.dim(`Run manually: ${client} mcp add memex -- node ${JSON.stringify(mcpPath)}`),
          );
        }
        process.exit(1);
      }

      console.log(
        pc.green('\nDone. Restart Claude Code and Codex to activate the memex MCP server.'),
      );
    });

  mcp
    .command('path')
    .description('Print the MCP server binary path')
    .action(() => {
      console.log(getMcpBinPath());
    });
};
