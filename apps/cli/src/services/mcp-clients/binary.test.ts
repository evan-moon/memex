import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMcpBinPath } from './binary.ts';

describe('getMcpBinPath', () => {
  it('finds the built MCP server from wherever this module is running', () => {
    const path = getMcpBinPath();

    expect(path.endsWith('apps/mcp/dist/index.js')).toBe(true);
    expect(existsSync(path)).toBe(true);
  });
});
