import { execFile } from 'node:child_process';
import { dirname, relative } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type Revision = { sha: string; at: string; subject: string; author: string };

export type History =
  | { tracked: true; revisions: Revision[] }
  | { tracked: false; reason: 'no-repo' | 'never-committed' };

// A unit separator rather than a comma: commit subjects contain commas, tabs and
// just about everything else a person can type.
const SEPARATOR = '\x1f';

// git is asked from the file's own directory, so a vault and a source repo each
// answer for themselves rather than the app guessing which one owns the path.
const git = async (cwd: string, args: string[]) => {
  const { stdout } = await run('git', args, { cwd, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
};

const repoOf = (filePath: string) =>
  git(dirname(filePath), ['rev-parse', '--show-toplevel'])
    .then((out) => out.trim())
    .catch(() => null);

export const readHistory = async (filePath: string, limit = 50): Promise<History> => {
  const root = await repoOf(filePath);
  if (root === null) return { tracked: false, reason: 'no-repo' };

  const log = await git(root, [
    'log',
    `-${limit}`,
    '--follow',
    `--format=%H${SEPARATOR}%aI${SEPARATOR}%an${SEPARATOR}%s`,
    '--',
    relative(root, filePath),
  ]).catch(() => '');

  const revisions = log
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [sha = '', at = '', author = '', subject = ''] = line.split(SEPARATOR);
      return { sha, at, author, subject };
    });

  // A file that exists but was never committed has no history to show, and
  // saying "no repo" would send someone looking for the wrong thing.
  return revisions.length === 0
    ? { tracked: false, reason: 'never-committed' }
    : { tracked: true, revisions };
};

export const readRevision = async (filePath: string, sha: string): Promise<string | null> => {
  const root = await repoOf(filePath);
  if (root === null) return null;
  return git(root, ['show', `${sha}:${relative(root, filePath)}`]).catch(() => null);
};
