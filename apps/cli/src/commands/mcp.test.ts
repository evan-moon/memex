import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getMcpBinPath, installMcpClients } from './mcp.ts';

describe('getMcpBinPath', () => {
  it('uses the workspace MCP dist when running from this repository', () => {
    const expectedPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../mcp/dist/index.js',
    );
    expect(getMcpBinPath()).toBe(expectedPath);
  });
});

describe('installMcpClients', () => {
  it('registers memex with Claude Code and Codex using the built MCP path', () => {
    const runClient = vi.fn();

    const result = installMcpClients('/workspace/apps/mcp/dist/index.js', runClient);

    expect(result.failures).toEqual([]);
    expect(runClient.mock.calls).toEqual([
      ['claude', ['mcp', 'remove', 'memex', '-s', 'local']],
      ['claude', ['mcp', 'add', 'memex', '--', 'node', '/workspace/apps/mcp/dist/index.js']],
      ['codex', ['mcp', 'add', 'memex', '--', 'node', '/workspace/apps/mcp/dist/index.js']],
    ]);
  });

  it('continues to Codex and reports a client failure without hiding successful registrations', () => {
    const runClient = vi.fn((client: string, args: string[]) => {
      if (client === 'codex') throw new Error('codex unavailable');
      if (args[1] === 'remove') throw new Error('memex not installed');
    });

    const result = installMcpClients('/workspace/apps/mcp/dist/index.js', runClient);

    expect(result.failures).toEqual([{ client: 'codex', error: expect.any(Error) }]);
    expect(runClient).toHaveBeenCalledTimes(3);
  });
});
