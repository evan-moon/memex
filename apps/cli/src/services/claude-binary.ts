import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

// An MCP client launches the server with none of the login shell's PATH, and
// the native installer puts the binary under the home directory. Resolving by
// name alone is how a machine that has Claude Code is reported as missing it.
const HOME_CANDIDATES = ['.local/bin/claude', '.claude/local/claude'];

const ABSOLUTE_CANDIDATES = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'];

const fromPath = (pathEnv: string) =>
  pathEnv
    .split(delimiter)
    .filter((dir) => dir !== '')
    .map((dir) => join(dir, 'claude'));

export const findClaudeBinary = (home: string, pathEnv = ''): string | null =>
  [
    ...HOME_CANDIDATES.map((relative) => join(home, relative)),
    ...ABSOLUTE_CANDIDATES,
    ...fromPath(pathEnv),
  ].find(existsSync) ?? null;
