import { join } from 'node:path';

export const WINDOWS_PIPE = '\\\\.\\pipe\\memex-recall';

export const recallSocketPath = (configDir: string) =>
  process.platform === 'win32' ? WINDOWS_PIPE : join(configDir, 'recall.sock');

export const isFilesystemSocket = () => process.platform !== 'win32';

export const RECALL_PING = '\u0000ping';

export const EMPTY_RECALL_RESPONSE = '[]';

export const isProbeQuery = (query: string) => query.length === 0 || query === RECALL_PING;

export type RecallHit = {
  id: number;
  title: string;
  layer: string;
};
