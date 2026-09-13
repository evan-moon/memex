import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNote, insertNote, openDb } from '@memex/db';
import type { MemexConfig } from '@memex/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createSourceFolderService } from './source-folders.ts';

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((path) => {
    rmSync(path, { recursive: true, force: true });
  });
});

const directory = (name: string) => {
  const path = mkdtempSync(join(tmpdir(), name));
  roots.push(path);
  return path;
};

describe('source folder service', () => {
  it('disconnects a source from search and leaves every source file alone', async () => {
    const db = directory('memex-source-db-');
    const vault = directory('memex-source-vault-');
    const source = directory('memex-source-connected-');
    const filePath = join(source, 'kept.md');
    writeFileSync(filePath, '# kept\n', 'utf8');
    const client = openDb(db);
    const note = insertNote(client, {
      title: 'kept',
      content: '# kept\n',
      filePath,
      source: 'index',
    });
    const state: { config: MemexConfig } = {
      config: {
        vault_path: vault,
        sources: [{ path: source }],
        models: {
          chat: { provider: 'claude-code', model: 'sonnet' },
          draft: { provider: 'claude-code', model: 'sonnet' },
          sweep: { provider: 'claude-code', model: 'sonnet' },
        },
        onboarded_at: null,
      } satisfies MemexConfig,
    };
    const service = createSourceFolderService({
      client,
      embedder: async () => [],
      vaultPath: () => vault,
      readConfig: () => state.config,
      writeConfig: (config) => {
        state.config = config;
      },
    });

    const result = await service.remove(source);

    expect(result.forgotten).toBe(1);
    expect(getNote(client, note.id)).toBeUndefined();
    expect(existsSync(filePath)).toBe(true);
    expect(state.config.sources).toEqual([]);
    client.sqlite.close();
  });
});
