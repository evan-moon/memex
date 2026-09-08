import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getNoteByFilePath, listNotes, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexDirectory } from '../../apps/cli/src/services/indexer.ts';
import { copyFixtureVault, stubEmbedder, temporaryDbDir } from './vault.ts';

// The fixture is only worth having if memex can actually read it. This is the
// baseline the rest of the work is measured against: what the vault contains
// before anything in the redesign touches it.
describe('the v1 fixture vault', () => {
  let vault: { path: string; dispose: () => void };
  let db: { path: string; dispose: () => void };
  let client: MemexClient;

  beforeEach(() => {
    vault = copyFixtureVault();
    db = temporaryDbDir();
    client = openDb(db.path);
  });

  afterEach(() => {
    client.sqlite.close();
    vault.dispose();
    db.dispose();
  });

  const index = () => indexDirectory(client, stubEmbedder, vault.path);

  it('indexes every document without losing one', async () => {
    const stats = await index();

    // The fixture README is a document too, and it is indexed like any other.
    expect(stats.added).toBe(16);
    expect(listNotes(client, 100)).toHaveLength(16);
  });

  it('is not a git repository, which is the point of it', () => {
    expect(existsSync(join(vault.path, '.git'))).toBe(false);
  });

  it('keeps two documents that share a title apart', async () => {
    await index();

    const long = getNoteByFilePath(client, join(vault.path, 'writing/ai-and-me.md'));
    const short = getNoteByFilePath(client, join(vault.path, 'writing/ai-and-me 2.md'));

    expect(long?.title).toBe('AI와 일하며 달라진 것');
    expect(short?.title).toBe('AI와 일하며 달라진 것');
    expect(long?.id).not.toBe(short?.id);
  });

  it('reads the layers the memory contract still speaks', async () => {
    await index();

    const plan = getNoteByFilePath(client, join(vault.path, 'projects/launch-plan.md'));
    const record = getNoteByFilePath(client, join(vault.path, 'projects/launch-plan-history.md'));
    const rule = getNoteByFilePath(client, join(vault.path, 'rules/approved-tone.md'));

    expect(plan?.layer).toBe('state');
    expect(record?.layer).toBe('past');
    expect(rule?.layer).toBe('rule');
  });

  it('carries frontmatter keys memex has no idea about', async () => {
    await index();

    const raw = readFileSync(join(vault.path, 'notes/unknown-yaml.md'), 'utf8');
    expect(raw).toContain('obsidian_plugin_state:');
    expect(raw).toContain('cssclass: wide-table');
  });

  it('holds a document with no frontmatter at all', async () => {
    await index();

    const note = getNoteByFilePath(client, join(vault.path, 'notes/no-frontmatter.md'));
    expect(note?.title).toBe('YAML 이 없는 노트');
    expect(readFileSync(join(vault.path, 'notes/no-frontmatter.md'), 'utf8')).not.toContain('---');
  });

  it('holds the long document the experience spec asks to check', async () => {
    const raw = readFileSync(join(vault.path, 'notes/long-document.md'), 'utf8');
    expect(raw.length).toBeGreaterThan(22_000);
  });

  it('points an image at a file that is really there', async () => {
    const raw = readFileSync(join(vault.path, 'notes/with-image.md'), 'utf8');
    expect(raw).toContain('](../assets/diagram.png)');
    expect(existsSync(join(vault.path, 'assets/diagram.png'))).toBe(true);
  });

  it('separates an approved rule from one still waiting', async () => {
    await index();

    const approved = readFileSync(join(vault.path, 'rules/approved-tone.md'), 'utf8');
    const waiting = readFileSync(join(vault.path, 'rules/proposed-brevity.md'), 'utf8');

    expect(approved).toContain('rule_status: canonical');
    expect(waiting).toContain('rule_status: provisional');
  });
});

// A schema step runs against a vault somebody is in the middle of using. The one
// thing it may never do is touch a file: the documents are the user's, and a
// migration that rewrote them would be unrecoverable in a vault with no git.
describe('a migration over the fixture vault', () => {
  let vault: { path: string; dispose: () => void };
  let db: { path: string; dispose: () => void };

  beforeEach(() => {
    vault = copyFixtureVault();
    db = temporaryDbDir();
  });

  afterEach(() => {
    vault.dispose();
    db.dispose();
  });

  const fingerprint = (root: string): Record<string, string> => {
    const walk = (at: string): string[] =>
      readdirSync(at).flatMap((name) => {
        const here = join(at, name);
        return statSync(here).isDirectory() ? walk(here) : [here];
      });
    return Object.fromEntries(
      walk(root).map((file) => [
        relative(root, file),
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ]),
    );
  };

  it('leaves every document byte for byte as it found it', async () => {
    const client = openDb(db.path);
    await indexDirectory(client, stubEmbedder, vault.path);
    const before = fingerprint(vault.path);

    // Forget the stamp so every step runs again over a populated database.
    client.sqlite.prepare("DELETE FROM index_meta WHERE key = 'schema_version'").run();
    client.sqlite.close();
    const reopened = openDb(db.path);
    const notes = listNotes(reopened, 100).length;
    reopened.sqlite.close();

    expect(fingerprint(vault.path)).toEqual(before);
    expect(notes).toBe(16);
  });
});
