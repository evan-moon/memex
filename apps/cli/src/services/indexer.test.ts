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
