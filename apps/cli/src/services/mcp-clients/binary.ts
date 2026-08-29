import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const findUp = (from: string, relative: string): string | null => {
  const candidate = join(from, relative);
  if (existsSync(candidate)) return candidate;
  const parent = dirname(from);
  return parent === from ? null : findUp(parent, relative);
};

export const getMcpBinPath = (): string => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return (
    findUp(moduleDir, 'mcp/dist/index.js') ??
    findUp(moduleDir, 'apps/mcp/dist/index.js') ??
    join(moduleDir, 'mcp.js')
  );
};
