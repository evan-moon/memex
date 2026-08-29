import type { McpClientId } from './clients.ts';

export type McpServerEntry = {
  command: string;
  args: string[];
  stdio: boolean;
};

export type McpRegistration =
  | { kind: 'absent' }
  | { kind: 'current' }
  | { kind: 'elsewhere'; command: string };

export type McpClientState = {
  id: McpClientId;
  name: string;
  configPath: string;
  installed: boolean;
  registration: McpRegistration;
};

export type McpConnections = {
  serverPath: string;
  clients: McpClientState[];
};

export type ConfigCodec = {
  read: (source: string, name: string) => McpServerEntry | null;
  write: (source: string, name: string, entry: McpServerEntry) => string;
};
