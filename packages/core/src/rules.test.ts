import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNote, insertNote, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approveRuleNote, declineRuleNote } from './rules.ts';

describe('a rule decision reaches the file', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-rules-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-rules-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  const proposal = () => {
    const filePath = join(vaultDir, 'policy.md');
    const content =
      '---\ntitle: Search policy\nlayer: rule\nrule_status: provisional\n---\n\nsearch first';
    writeFileSync(filePath, content, 'utf8');
    return insertNote(client, {
      title: 'Search policy',
      content,
      filePath,
      source: 'claude-code',
      layer: 'rule',
      ruleStatus: 'provisional',
    });
  };

  it('writes the approval into the file, not only the row', () => {
    const note = proposal();
    const approved = approveRuleNote(client, note.id);

    expect(approved?.ruleStatus).toBe('canonical');
    expect(getNote(client, note.id)?.ruleStatus).toBe('canonical');
    expect(readFileSync(note.filePath, 'utf8')).toContain('rule_status: canonical');
  });

  it('takes the status line out when a proposal is turned down', () => {
    const note = proposal();
    const declined = declineRuleNote(client, note.id, 'state');

    expect(declined?.layer).toBe('state');
    const file = readFileSync(note.filePath, 'utf8');
    expect(file).toContain('layer: state');
    expect(file).not.toContain('rule_status');
    expect(file).toContain('search first');
  });

  it('says nothing happened when the note is not there', () => {
    expect(approveRuleNote(client, 404)).toBeUndefined();
  });
});
