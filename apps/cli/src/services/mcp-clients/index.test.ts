import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectMcpClient, readMcpConnections } from './index.ts';

const SERVER = '/repo/apps/mcp/dist/index.js';

const stateOf = (home: string, id: string) =>
  readMcpConnections(home, SERVER).clients.find((client) => client.id === id);

const put = (path: string, contents: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
};

describe('readMcpConnections', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'memex-mcp-home-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('lists every client it knows, and marks the ones this machine has', () => {
    mkdirSync(join(home, '.codex'), { recursive: true });

    const { clients } = readMcpConnections(home, SERVER);

    expect(clients.map((client) => client.id)).toEqual([
      'claude-desktop',
      'claude-code',
      'codex',
      'cursor',
    ]);
    expect(stateOf(home, 'codex')?.installed).toBe(true);
    expect(stateOf(home, 'cursor')?.installed).toBe(false);
  });

  it('separates never registered from registered against a path that moved', () => {
    put(
      join(home, '.cursor/mcp.json'),
      JSON.stringify({ mcpServers: { memex: { command: 'node', args: ['/old/index.js'] } } }),
    );

    expect(stateOf(home, 'claude-code')?.registration).toEqual({ kind: 'absent' });
    expect(stateOf(home, 'cursor')?.registration).toEqual({
      kind: 'elsewhere',
      command: 'node /old/index.js',
    });
  });
});

describe('connectMcpClient', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'memex-mcp-home-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('registers a client whose config file does not exist yet', () => {
    const connections = connectMcpClient(home, SERVER, 'claude-desktop');

    expect(connections?.clients.find((c) => c.id === 'claude-desktop')?.registration).toEqual({
      kind: 'current',
    });
    expect(stateOf(home, 'claude-desktop')?.registration).toEqual({ kind: 'current' });
  });

  it('repoints a stale registration without touching the rest of the file', () => {
    const path = join(home, '.claude.json');
    put(
      path,
      JSON.stringify({
        numStartups: 645,
        mcpServers: { memex: { type: 'stdio', command: 'node', args: ['/old/index.js'] } },
      }),
    );

    connectMcpClient(home, SERVER, 'claude-code');

    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.numStartups).toBe(645);
    expect(written.mcpServers.memex.args).toEqual([SERVER]);
    expect(stateOf(home, 'claude-code')?.registration).toEqual({ kind: 'current' });
  });

  it('writes the TOML client through its own format', () => {
    connectMcpClient(home, SERVER, 'codex');

    expect(readFileSync(join(home, '.codex/config.toml'), 'utf8')).toContain('[mcp_servers.memex]');
    expect(stateOf(home, 'codex')?.registration).toEqual({ kind: 'current' });
  });

  it('reports an unknown client instead of writing a file for it', () => {
    expect(connectMcpClient(home, SERVER, 'nothing' as 'codex')).toBeNull();
  });
});
