import type { ConfigCodec, McpServerEntry } from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const parse = (source: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(source);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const serversOf = (config: Record<string, unknown>): Record<string, unknown> => {
  const servers = config.mcpServers;
  return isRecord(servers) ? servers : {};
};

export const readJsonServer = (source: string, name: string): McpServerEntry | null => {
  const entry = serversOf(parse(source))[name];
  if (!isRecord(entry)) return null;
  const { command, args } = entry;
  if (typeof command !== 'string') return null;
  return { command, args: isStringArray(args) ? args : [], stdio: entry.type === 'stdio' };
};

export const writeJsonServer = (source: string, name: string, entry: McpServerEntry): string => {
  const config = parse(source);
  const servers = serversOf(config);
  const value = entry.stdio
    ? { type: 'stdio', command: entry.command, args: entry.args, env: {} }
    : { command: entry.command, args: entry.args };
  return `${JSON.stringify({ ...config, mcpServers: { ...servers, [name]: value } }, null, 2)}\n`;
};

export const jsonCodec: ConfigCodec = { read: readJsonServer, write: writeJsonServer };
