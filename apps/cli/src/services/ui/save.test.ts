import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editNote } from '@memex/core';
import { openDb } from '@memex/db';
import { afterAll, describe, expect, it } from 'vitest';
import { bodyOf, noteDetail, recompose } from './notes.ts';

// The save route is editNote(recompose(...)). What matters is that a body
// edited on screen goes back into the file without taking the frontmatter with
// it — renderNoteFile only preserves fields it can still see.
describe('saving an edited body', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-save-'));
  const vault = mkdtempSync(join(tmpdir(), 'memex-vault-'));
  const client = openDb(dir);
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });

  const embedder = async () => Array.from({ length: 768 }, () => 0.001);
  const filePath = join(vault, 'note.md');
  const original = [
    '---',
    'title: 현황',
    'date: 2026-01-01',
    'categories: [opula]',
    'aliases: ["현황: 요약"]',
    'tags: [opula]',
    'layer: state',
    '---',
    '',
    '# 현황',
    '',
    '아직 A다.',
    '',
  ].join('\n');

  writeFileSync(filePath, original, 'utf8');
  client.sqlite
    .prepare(
      `INSERT INTO notes (id, title, content, category, tags, layer, file_path,
                          created_at, updated_at, authored_at, source)
       VALUES (1, '현황', ?, 'projects', '["opula"]', 'state', ?, ?, ?, ?, 'manual')`,
    )
    .run(
      original,
      filePath,
      Date.parse('2026-01-01'),
      Date.parse('2026-01-01'),
      Date.parse('2026-01-01'),
    );

  it('keeps every frontmatter field the file alone records', async () => {
    const note = noteDetail(client, 1, vault);
    if (!note) throw new Error('missing note');
    expect(note.content).toBe('아직 A다.\n');

    await editNote(client, embedder, vault, 1, {
      content: recompose(original, '이제 B다.\n', '현황'),
    });

    const saved = readFileSync(filePath, 'utf8');
    expect(saved).toContain('date: 2026-01-01');
    expect(saved).toContain('categories: [opula]');
    expect(saved).toContain('aliases: ["현황: 요약"]');
    expect(saved).toContain('# 현황');
    expect(saved).toContain('이제 B다.');
    expect(saved).not.toContain('아직 A다.');
  });

  it('leaves the reloaded body free of the head again', () => {
    expect(bodyOf(readFileSync(filePath, 'utf8'), '현황')).toBe('이제 B다.\n');
  });
});
