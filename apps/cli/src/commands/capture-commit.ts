import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import { isSaveRejection, saveNote } from '@memex/core';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { CONFIG_DIR, expandPath, loadConfig, MODEL_CACHE_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';

const MAX_FILES = 50;

const git = (repo: string, args: string): string =>
  execSync(`git ${args}`, { cwd: repo, encoding: 'utf8' }).trim();

const printHookSnippet = () => {
  console.log();
  console.log(pc.bold('Auto-capture commits — install a post-commit hook (per repo):'));
  console.log();
  console.log(
    pc.green(`  cat > .git/hooks/post-commit <<'HOOK'
#!/bin/sh
# memex Auto-Contextualizer: capture "why this code changed" at the moment it happens.
(memex capture-commit --repo "$(git rev-parse --show-toplevel)" >> ~/.memex/git-capture.log 2>&1 &)
HOOK
  chmod +x .git/hooks/post-commit`),
  );
  console.log();
  console.log(pc.dim('The capture runs in the background, so committing stays instant.'));
  console.log();
};

export const registerCaptureCommit = (program: Command) => {
  program
    .command('capture-commit')
    .description('Save the latest commit of a repo as a past note (message + branch + files)')
    .option('--repo <path>', 'Repository path', process.cwd())
    .option('--hook', 'Print the post-commit hook snippet instead of capturing')
    .action(async (opts: { repo: string; hook?: boolean }) => {
      if (opts.hook) {
        printHookSnippet();
        return;
      }

      let hash: string;
      let repoRoot: string;
      try {
        repoRoot = git(opts.repo, 'rev-parse --show-toplevel');
        hash = git(opts.repo, 'log -1 --format=%H');
      } catch {
        console.error(pc.red(`Not a git repository (or no commits): ${opts.repo}`));
        process.exit(1);
      }

      // Merge commits restate work that was already captured commit-by-commit.
      const parents = git(opts.repo, `rev-list --parents -n 1 ${hash}`).split(/\s+/);
      if (parents.length > 2) {
        console.log(pc.dim('Merge commit — skipped.'));
        return;
      }

      const short = hash.slice(0, 7);
      const repoName = basename(repoRoot);
      const subject = git(opts.repo, 'log -1 --format=%s');
      const body = git(opts.repo, 'log -1 --format=%b');
      const branch = git(opts.repo, 'rev-parse --abbrev-ref HEAD');
      const files = git(opts.repo, `diff-tree --no-commit-id --name-only -r ${hash}`)
        .split('\n')
        .filter(Boolean);

      const title = `[git] ${repoName}: ${subject} (${short})`;

      const config = loadConfig();
      const vaultPath = expandPath(config.vault_path);
      const client = openDb(CONFIG_DIR);

      // Hooks can re-fire for the same HEAD (amend aborts, CI re-runs) — keep
      // the capture idempotent.
      const existing = client.sqlite
        .prepare("SELECT id FROM notes WHERE source = 'git' AND title = ?")
        .get(title) as { id: number } | undefined;
      if (existing) {
        console.log(pc.dim(`Already captured as note #${existing.id}.`));
        return;
      }

      guardEmbeddingModel(client);
      const embedder = await createEmbedder(MODEL_CACHE_DIR);

      const shownFiles = files.slice(0, MAX_FILES);
      const moreFiles = files.length - shownFiles.length;
      const content = [
        `commit ${hash}`,
        `branch: ${branch}`,
        '',
        subject,
        ...(body ? ['', body] : []),
        '',
        'files:',
        ...shownFiles.map((f) => `- ${f}`),
        ...(moreFiles > 0 ? [`- … +${moreFiles} more`] : []),
      ].join('\n');

      const result = await saveNote(client, embedder, vaultPath, {
        title,
        content,
        source: 'git',
        layer: 'past',
        folder: `dev/git/${repoName}`,
        tags: [repoName, 'git', branch],
        actor: 'user',
      });
      if (isSaveRejection(result)) {
        console.error(pc.red(result.message));
        process.exit(1);
      }

      console.log(`${pc.green('✓')} captured ${pc.bold(short)} as note #${result.note.id}`);
    });
};
