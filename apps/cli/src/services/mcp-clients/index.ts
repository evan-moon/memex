import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type McpClientId,
  type McpClientSpec,
  type McpConfigFormat,
  mcpClientSpecs,
  SERVER_NAME,
} from './clients.ts';
import { jsonCodec } from './json-config.ts';
import { tomlCodec } from './toml-config.ts';
import type {
  ConfigCodec,
  McpClientState,
  McpConnections,
  McpRegistration,
  McpServerEntry,
} from './types.ts';

const codecByFormat: Record<McpConfigFormat, ConfigCodec> = { json: jsonCodec, toml: tomlCodec };

const readSource = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

const entryFor = (spec: McpClientSpec, serverPath: string): McpServerEntry => ({
  command: 'node',
  args: [serverPath],
  stdio: spec.stdioType,
});

const sameEntry = (found: McpServerEntry, wanted: McpServerEntry) =>
  found.command === wanted.command && found.args.join(' ') === wanted.args.join(' ');

const registrationOf = (spec: McpClientSpec, serverPath: string): McpRegistration => {
  const found = codecByFormat[spec.format].read(readSource(spec.configPath), SERVER_NAME);
  if (found === null) return { kind: 'absent' };
  return sameEntry(found, entryFor(spec, serverPath))
    ? { kind: 'current' }
    : { kind: 'elsewhere', command: [found.command, ...found.args].join(' ') };
};

const stateOf = (spec: McpClientSpec, serverPath: string): McpClientState => ({
  id: spec.id,
  name: spec.name,
  configPath: spec.configPath,
  installed: existsSync(spec.markerPath),
  registration: registrationOf(spec, serverPath),
});

export const readMcpConnections = (home: string, serverPath: string): McpConnections => ({
  serverPath,
  clients: mcpClientSpecs(home).map((spec) => stateOf(spec, serverPath)),
});

const writeConfig = (path: string, contents: string) => {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.memex-${process.pid}`;
  writeFileSync(temp, contents, 'utf8');
  renameSync(temp, path);
};

export const connectMcpClient = (
  home: string,
  serverPath: string,
  id: McpClientId,
): McpConnections | null => {
  const spec = mcpClientSpecs(home).find((candidate) => candidate.id === id);
  if (spec === undefined) return null;
  const codec = codecByFormat[spec.format];
  writeConfig(
    spec.configPath,
    codec.write(readSource(spec.configPath), SERVER_NAME, entryFor(spec, serverPath)),
  );
  return readMcpConnections(home, serverPath);
};

export { getMcpBinPath } from './binary.ts';
export { isMcpClientId, type McpClientId, SERVER_NAME } from './clients.ts';
export type { McpClientState, McpConnections, McpRegistration } from './types.ts';
