import type { ConfigCodec, McpServerEntry } from './types.ts';

const headerOf = (name: string) => `[mcp_servers.${name}]`;

const isHeader = (line: string) => line.trimStart().startsWith('[');

const sectionRange = (lines: string[], name: string) => {
  const header = headerOf(name);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return null;
  const offset = lines.slice(start + 1).findIndex(isHeader);
  return { start, end: offset < 0 ? lines.length : start + 1 + offset };
};

const quoted = (body: string, key: string): string | null => {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`, 'm').exec(body);
  if (match?.[1] === undefined) return null;
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
};

const stringList = (body: string, key: string): string[] => {
  const match = new RegExp(`${key}\\s*=\\s*(\\[[^\\]]*\\])`).exec(body);
  if (match?.[1] === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(match[1].replace(/,\s*\]$/, ']'));
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const readTomlServer = (source: string, name: string): McpServerEntry | null => {
  const lines = source.split('\n');
  const range = sectionRange(lines, name);
  if (range === null) return null;
  const body = lines.slice(range.start + 1, range.end).join('\n');
  const command = quoted(body, 'command');
  return command === null ? null : { command, args: stringList(body, 'args'), stdio: false };
};

const block = (name: string, entry: McpServerEntry) =>
  [
    headerOf(name),
    `command = ${JSON.stringify(entry.command)}`,
    `args = [${entry.args.map((arg) => JSON.stringify(arg)).join(', ')}]`,
  ].join('\n');

export const writeTomlServer = (source: string, name: string, entry: McpServerEntry): string => {
  const lines = source.split('\n');
  const range = sectionRange(lines, name);
  if (range === null) {
    const head = source.trim();
    return head === '' ? `${block(name, entry)}\n` : `${head}\n\n${block(name, entry)}\n`;
  }
  const next = [...lines.slice(0, range.start), block(name, entry), '', ...lines.slice(range.end)];
  return `${next
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
};

export const tomlCodec: ConfigCodec = { read: readTomlServer, write: writeTomlServer };
