import { describe, expect, it } from 'vitest';
import { readTomlServer, writeTomlServer } from './toml-config.ts';

const entry = { command: 'node', args: ['/repo/apps/mcp/dist/index.js'], stdio: false };

const existing = `model = "gpt-5"

[mcp_servers.aside]
command = "/Users/evan/.local/bin/aside"
args = ["mcp"]

[mcp_servers.memex]
command = "node"
args = ["/old/index.js"]
`;

describe('readTomlServer', () => {
  it('reads the section that belongs to this server and stops at the next one', () => {
    expect(readTomlServer(existing, 'memex')).toEqual({
      command: 'node',
      args: ['/old/index.js'],
      stdio: false,
    });
    expect(readTomlServer(existing, 'aside')).toEqual({
      command: '/Users/evan/.local/bin/aside',
      args: ['mcp'],
      stdio: false,
    });
  });

  it('reports nothing when the file has no section for it', () => {
    expect(readTomlServer('model = "gpt-5"\n', 'memex')).toBeNull();
    expect(readTomlServer('', 'memex')).toBeNull();
  });
});

describe('writeTomlServer', () => {
  it('replaces the section in place and leaves the rest of the file alone', () => {
    const written = writeTomlServer(existing, 'memex', entry);

    expect(readTomlServer(written, 'memex')).toEqual(entry);
    expect(readTomlServer(written, 'aside')?.args).toEqual(['mcp']);
    expect(written).toContain('model = "gpt-5"');
  });

  it('keeps a section that follows the one it replaced', () => {
    const source = `[mcp_servers.memex]
command = "node"
args = ["/old/index.js"]

[mcp_servers.aside]
command = "aside"
args = ["mcp"]
`;

    const written = writeTomlServer(source, 'memex', entry);

    expect(readTomlServer(written, 'memex')).toEqual(entry);
    expect(readTomlServer(written, 'aside')).toEqual({
      command: 'aside',
      args: ['mcp'],
      stdio: false,
    });
  });

  it('appends the section when the file has none, and starts one that is not there yet', () => {
    expect(readTomlServer(writeTomlServer('model = "gpt-5"\n', 'memex', entry), 'memex')).toEqual(
      entry,
    );
    expect(readTomlServer(writeTomlServer('', 'memex', entry), 'memex')).toEqual(entry);
  });
});
