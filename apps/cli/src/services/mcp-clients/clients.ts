import { join } from 'node:path';

const MCP_CLIENT_IDS = ['claude-desktop', 'claude-code', 'codex', 'cursor'] as const;

export type McpClientId = (typeof MCP_CLIENT_IDS)[number];

export const isMcpClientId = (value: unknown): value is McpClientId =>
  typeof value === 'string' && MCP_CLIENT_IDS.some((id) => id === value);

export type McpConfigFormat = 'json' | 'toml';

export type McpClientSpec = {
  id: McpClientId;
  name: string;
  format: McpConfigFormat;
  configPath: string;
  markerPath: string;
  stdioType: boolean;
};

export const SERVER_NAME = 'memex';

export const mcpClientSpecs = (home: string): McpClientSpec[] => [
  {
    id: 'claude-desktop',
    name: 'Claude',
    format: 'json',
    configPath: join(home, 'Library/Application Support/Claude/claude_desktop_config.json'),
    markerPath: join(home, 'Library/Application Support/Claude'),
    stdioType: false,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    format: 'json',
    configPath: join(home, '.claude.json'),
    markerPath: join(home, '.claude'),
    stdioType: true,
  },
  {
    id: 'codex',
    name: 'Codex',
    format: 'toml',
    configPath: join(home, '.codex/config.toml'),
    markerPath: join(home, '.codex'),
    stdioType: false,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    format: 'json',
    configPath: join(home, '.cursor/mcp.json'),
    markerPath: join(home, '.cursor'),
    stdioType: false,
  },
];
