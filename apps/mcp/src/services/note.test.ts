import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNote, openDb, type MemexClient } from '@memex/db';
import { editNote, isEditRejection } from './note.ts';

const stubEmbedder = async (): Promise<number[]> => new Array(768).fill(0);

describe('editNote — layer guards', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-svc-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-svc-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it('returns null when the note does not exist', async () => {
    const result = await editNote(client, stubEmbedder, vaultDir, 999, { content: 'x' });
    expect(result).toBeNull();
  });

  it('rejects past notes with PAST_IMMUTABLE and an Amendment suggestion', async () => {
    const note = insertNote(client, {
      title: '1on1 with Jeehee',
      content: 'old log',
      filePath: join(vaultDir, '1on1.md'),
      source: 'manual',
      layer: 'past',
    });

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, { content: 'edit attempt' });
    expect(isEditRejection(result)).toBe(true);
    if (!isEditRejection(result)) return;
    expect(result.error).toBe('PAST_IMMUTABLE');
    if (result.error !== 'PAST_IMMUTABLE') return;
    expect(result.suggestion.action).toBe('save_note');
    expect(result.suggestion.title).toBe('[Amendment] 1on1 with Jeehee');
    expect(result.suggestion.link).toBe('[[1on1 with Jeehee]]');
    expect(result.suggestion.layer).toBe('past');
  });

  it('rejects rule notes with RULE_USER_ONLY', async () => {
    const note = insertNote(client, {
      title: 'code style',
      content: 'FP first',
      filePath: join(vaultDir, 'style.md'),
      source: 'manual',
      layer: 'rule',
    });

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, { content: 'OOP first' });
    expect(isEditRejection(result)).toBe(true);
    if (!isEditRejection(result)) return;
    expect(result.error).toBe('RULE_USER_ONLY');
  });
});
