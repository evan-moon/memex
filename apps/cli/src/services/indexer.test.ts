import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNoteByFilePath, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexDirectory } from './indexer.ts';

const stubEmbedder = async (): Promise<number[]> => new Array(768).fill(0.1);

describe('indexDirectory', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-indexer-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-indexer-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it('parses authored_at from frontmatter dates on insert', async () => {
    const filePath = join(vaultDir, 'dated.md');
    writeFileSync(filePath, '---\ntitle: Old Retro\ndate: 2024-03-15\n---\n\nbody', 'utf8');

    await indexDirectory(client, stubEmbedder, vaultDir);

    const note = getNoteByFilePath(client, filePath);
    expect(note?.authoredAt).toBe(Date.parse('2024-03-15'));
  });

  it('leaves authored_at null when the file carries no date', async () => {
    const filePath = join(vaultDir, 'undated.md');
    writeFileSync(filePath, '# No Date\n\nbody', 'utf8');

    await indexDirectory(client, stubEmbedder, vaultDir);

    expect(getNoteByFilePath(client, filePath)?.authoredAt).toBeNull();
  });

  it('imports inline frontmatter tags', async () => {
    const filePath = join(vaultDir, 'tagged.md');
    writeFileSync(filePath, '---\ntitle: Tagged\ntags: [typescript, "#fp"]\n---\n\nbody', 'utf8');

    await indexDirectory(client, stubEmbedder, vaultDir);

    const note = getNoteByFilePath(client, filePath);
    expect(JSON.parse(note?.tags ?? '[]')).toEqual(['typescript', 'fp']);
  });

  it('imports block-list frontmatter tags', async () => {
    const filePath = join(vaultDir, 'block-tags.md');
    writeFileSync(
      filePath,
      '---\ntitle: Block\ntags:\n  - typescript\n  - architecture\n---\n\nbody',
      'utf8',
    );

    await indexDirectory(client, stubEmbedder, vaultDir);

    const note = getNoteByFilePath(client, filePath);
    expect(JSON.parse(note?.tags ?? '[]')).toEqual(['typescript', 'architecture']);
  });

  it('applies a frontmatter layer on insert', async () => {
    const filePath = join(vaultDir, 'layered.md');
    writeFileSync(filePath, '---\ntitle: Roadmap\nlayer: state\n---\n\nbody', 'utf8');

    await indexDirectory(client, stubEmbedder, vaultDir);

    expect(getNoteByFilePath(client, filePath)?.layer).toBe('state');
  });

  it('keeps in-app tags when the file declares none', async () => {
    const filePath = join(vaultDir, 'untagged.md');
    writeFileSync(filePath, '# Untagged\n\nbody', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const note = getNoteByFilePath(client, filePath);
    expect(note).toBeDefined();
    if (!note) return;
    client.sqlite
      .prepare('UPDATE notes SET tags = ? WHERE id = ?')
      .run(JSON.stringify(['added-in-app']), note.id);

    await indexDirectory(client, stubEmbedder, vaultDir, undefined, true);

    expect(JSON.parse(getNoteByFilePath(client, filePath)?.tags ?? '[]')).toEqual(['added-in-app']);
  });

  it('skips ignored directories even when nested', async () => {
    const nested = join(vaultDir, 'sub', 'node_modules', 'pkg');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'README.md'), '# Should Not Index', 'utf8');
    writeFileSync(join(vaultDir, 'real.md'), '# Real Note\n\nbody', 'utf8');

    const stats = await indexDirectory(client, stubEmbedder, vaultDir);

    expect(stats.added).toBe(1);
    expect(getNoteByFilePath(client, join(nested, 'README.md'))).toBeUndefined();
  });
});
