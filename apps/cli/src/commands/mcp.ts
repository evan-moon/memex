import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import pc from 'picocolors';

const getMcpBinPath = (): string => {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  return join(cliDir, 'mcp.js');
};

export const registerMcp = (program: Command) => {
  const mcp = program.command('mcp').description('MCP server management');

  mcp
    .command('install')
    .description('Register memex MCP server with Claude Code')
    .action(() => {
      const mcpPath = getMcpBinPath();

      if (!existsSync(mcpPath)) {
        console.error(pc.red(`MCP binary not found at: ${mcpPath}`));
        console.error(pc.dim('Run `memex build` or reinstall the package.'));
        process.exit(1);
      }

      try {
        execSync(`claude mcp add memex -- node ${mcpPath}`, { stdio: 'inherit' });
        console.log(pc.green('\nDone. Restart Claude Code to activate the memex MCP server.'));
      } catch {
        console.error(pc.red('Failed to register MCP server.'));
        console.error(pc.dim(`Run manually: claude mcp add memex -- node ${mcpPath}`));
        process.exit(1);
      }
    });

  mcp
    .command('path')
    .description('Print the MCP server binary path')
    .action(() => {
      console.log(getMcpBinPath());
    });
};
