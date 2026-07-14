import { join } from 'node:path';

export const WINDOWS_PIPE = '\\\\.\\pipe\\memex-recall';

export const recallSocketPath = (configDir: string) =>
  process.platform === 'win32' ? WINDOWS_PIPE : join(configDir, 'recall.sock');

export const isFilesystemSocket = () => process.platform !== 'win32';

export type RecallHit = {
  id: number;
  title: string;
  layer: string;
};
