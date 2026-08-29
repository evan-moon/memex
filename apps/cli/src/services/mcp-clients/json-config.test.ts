import { describe, expect, it } from 'vitest';
import { readJsonServer, writeJsonServer } from './json-config.ts';

const entry = { command: 'node', args: ['/repo/apps/mcp/dist/index.js'], stdio: false };

describe('readJsonServer', () => {
  it('reads the command a client already runs for this server', () => {
    const source = JSON.stringify({
      mcpServers: { memex: { type: 'stdio', command: 'node', args: ['/old/index.js'] } },
    });

    expect(readJsonServer(source, 'memex')).toEqual({
      command: 'node',
      args: ['/old/index.js'],
      stdio: true,
    });
  });

  it('reports nothing for a missing file, an unparseable one, or another server', () => {
    expect(readJsonServer('', 'memex')).toBeNull();
    expect(readJsonServer('{ not json', 'memex')).toBeNull();
    expect(readJsonServer(JSON.stringify({ mcpServers: { other: {} } }), 'memex')).toBeNull();
  });
});

describe('writeJsonServer', () => {
  it('keeps every other key and every other server the client had', () => {
    const source = JSON.stringify(
      {
        globalShortcut: 'Ctrl+Space',
        mcpServers: { github: { command: 'npx', args: ['-y', 'server-github'] } },
        preferences: { theme: 'dark' },
      },
      null,
      2,
    );

    const written = JSON.parse(writeJsonServer(source, 'memex', entry));

    expect(written.globalShortcut).toBe('Ctrl+Space');
    expect(written.preferences).toEqual({ theme: 'dark' });
    expect(written.mcpServers.github).toEqual({ command: 'npx', args: ['-y', 'server-github'] });
    expect(written.mcpServers.memex).toEqual({
      command: 'node',
      args: ['/repo/apps/mcp/dist/index.js'],
    });
  });

  it('replaces a registration that points at a path that moved', () => {
    const source = JSON.stringify({
      mcpServers: { memex: { command: 'node', args: ['/old.js'] } },
    });

    expect(JSON.parse(writeJsonServer(source, 'memex', entry)).mcpServers.memex.args).toEqual([
      '/repo/apps/mcp/dist/index.js',
    ]);
  });

  it('writes the stdio shape Claude Code expects, and starts a file that is not there yet', () => {
    const written = JSON.parse(writeJsonServer('', 'memex', { ...entry, stdio: true }));

    expect(written.mcpServers.memex).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['/repo/apps/mcp/dist/index.js'],
      env: {},
    });
  });

  it('reads back what it writes', () => {
    expect(readJsonServer(writeJsonServer('', 'memex', entry), 'memex')).toEqual(entry);
  });
});
