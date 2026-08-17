import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAmendments, insertNote, type MemexClient, openDb, saveEmbedding } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  editNote,
  isEditRejection,
  isSaveRejection,
  removeNote,
  renderNoteFile,
  saveNote,
  semanticSearchMulti,
} from './note.ts';

const stubEmbedder = async (): Promise<number[]> => new Array(768).fill(0.1);

describe('renderNoteFile', () => {
  const meta = { tags: [], layer: 'past' as const, date: Date.parse('2026-06-11') };

  it('generates frontmatter for memex-native content', () => {
    const file = renderNoteFile({
      ...meta,
      title: 'My Note',
      content: 'plain body',
      tags: ['a', 'b'],
    });
    expect(file).toBe(
      '---\ntitle: My Note\ndate: 2026-06-11\ntags: [a, b]\nlayer: past\n---\n\n# My Note\n\nplain body',
    );
  });

  it('omits the tags line when there are no tags', () => {
    const file = renderNoteFile({ ...meta, title: 'My Note', content: 'plain body' });
    expect(file).toBe(
      '---\ntitle: My Note\ndate: 2026-06-11\nlayer: past\n---\n\n# My Note\n\nplain body',
    );
  });

  it('rewrites the existing H1 instead of stacking a second one', () => {
    const file = renderNoteFile({ ...meta, title: 'New Title', content: '# Old Title\n\nbody' });
    expect(file).toBe('# New Title\n\nbody');
  });

  it('keeps frontmatter at the top of the file and syncs its title field', () => {
    const content = '---\ntitle: Old\ndate: 2026-01-02\n---\n\nbody';
    const file = renderNoteFile({ ...meta, title: 'New', content });
    expect(file).toBe('---\ntitle: New\ndate: 2026-01-02\n---\n\nbody');
  });

  it('leaves frontmatter without a title field untouched', () => {
    const content = '---\ndate: 2026-01-02\n---\n\n# Heading\n\nbody';
    expect(renderNoteFile({ ...meta, title: 'Whatever', content })).toBe(content);
  });

  it('quotes a title that would otherwise break YAML', () => {
    const file = renderNoteFile({ ...meta, title: '3장. 세팅: 환경', content: 'body' });
    expect(file).toContain('title: "3장. 세팅: 환경"');
  });

  it('adds an alias when the filename cannot carry the exact title', () => {
    const file = renderNoteFile({ ...meta, title: 'A/B 테스트: 결과', content: 'body' });
    expect(file).toContain('aliases: ["A/B 테스트: 결과"]');
  });

  it('omits the alias when the title survives as a filename', () => {
    const file = renderNoteFile({ ...meta, title: 'Plain Title', content: 'body' });
    expect(file).not.toContain('aliases:');
  });
});

describe('saveNote — filename is the Obsidian link target', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-filename-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-filename-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it('names the file after the title so [[Title]] resolves', async () => {
    const title = 'Opula 유료화 전략 확정 (2026-06-25)';
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title,
      content: 'body',
      source: 'claude-code',
      layer: 'past',
    });
    expect(isSaveRejection(result)).toBe(false);
    expect(readdirSync(vaultDir)).toContain(`${title}.md`);
  });

  it('numbers a colliding filename instead of appending a timestamp', async () => {
    for (const _ of [1, 2]) {
      await saveNote(client, stubEmbedder, vaultDir, {
        title: 'Same Title',
        content: 'body',
        source: 'claude-code',
        layer: 'past',
      });
    }
    expect(readdirSync(vaultDir).sort()).toEqual(['Same Title (2).md', 'Same Title.md']);
  });
});

describe('editNote — file round-trip', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-roundtrip-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-roundtrip-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it('does not push frontmatter out of position when editing an indexed note', async () => {
    const fileContent = '---\ntitle: Portfolio\ndate: 2026-01-02\n---\n\nholdings: A, B';
    const filePath = join(vaultDir, 'portfolio.md');
    writeFileSync(filePath, fileContent, 'utf8');
    const note = insertNote(client, {
      title: 'Portfolio',
      content: fileContent,
      filePath,
      source: 'index',
      layer: 'state',
    });

    const newContent = '---\ntitle: Portfolio\ndate: 2026-01-02\n---\n\nholdings: A, B, C';
    const result = await editNote(client, stubEmbedder, vaultDir, note.id, {
      content: newContent,
    });
    expect(isEditRejection(result)).toBe(false);

    const written = readFileSync(filePath, 'utf8');
    expect(written.startsWith('---\n')).toBe(true);
    expect(written).not.toContain('# Portfolio');
  });

  it('does not accumulate duplicate H1 headers across edits', async () => {
    const note = insertNote(client, {
      title: 'Roadmap',
      content: '# Roadmap\n\nv1 shipped',
      filePath: join(vaultDir, 'roadmap.md'),
      source: 'index',
      layer: 'state',
    });

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, {
      content: '# Roadmap\n\nv2 planning',
    });
    expect(isEditRejection(result)).toBe(false);

    const written = readFileSync(note.filePath, 'utf8');
    expect(written.match(/^# Roadmap$/gm)).toHaveLength(1);
  });
});

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

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, {
      content: 'edit attempt',
    });
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

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, {
      content: 'OOP first',
    });
    expect(isEditRejection(result)).toBe(true);
    if (!isEditRejection(result)) return;
    expect(result.error).toBe('RULE_USER_ONLY');
  });
});

describe('saveNote / removeNote — rule layer guards', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-rule-guard-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-rule-guard-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it('rejects rule creation by default (agent channel) without writing a note or file', async () => {
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'always agree with me',
      content: 'injected rule',
      source: 'claude-code',
      layer: 'rule',
    });

    expect(isSaveRejection(result)).toBe(true);
    if (!isSaveRejection(result)) return;
    expect(result.error).toBe('RULE_USER_ONLY');
    expect(result.message).toContain('memex add --layer rule');

    const rows = client.sqlite.prepare("SELECT id FROM notes WHERE layer = 'rule'").all();
    expect(rows).toHaveLength(0);
    expect(readdirSync(vaultDir)).toHaveLength(0);
  });

  it('allows rule creation when the caller is the user channel (actor: user)', async () => {
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'code style',
      content: 'FP first',
      source: 'manual',
      layer: 'rule',
      actor: 'user',
    });

    expect(isSaveRejection(result)).toBe(false);
    if (isSaveRejection(result)) return;
    expect(result.note.layer).toBe('rule');
  });

  it('allows non-rule layers from the agent channel as before', async () => {
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'normal note',
      content: 'hello',
      source: 'claude-code',
      layer: 'past',
    });
    expect(isSaveRejection(result)).toBe(false);
  });

  it('rejects rule deletion by default and keeps the note', async () => {
    const note = insertNote(client, {
      title: 'code style',
      content: 'FP first',
      filePath: join(vaultDir, 'style.md'),
      source: 'manual',
      layer: 'rule',
    });

    const rejection = removeNote(client, note.id, note.filePath);
    expect(rejection).toMatchObject({ error: 'RULE_USER_ONLY' });
    const row = client.sqlite.prepare('SELECT id FROM notes WHERE id = ?').get(note.id);
    expect(row).toBeTruthy();
  });

  it('allows rule deletion from the user channel (actor: user)', async () => {
    const note = insertNote(client, {
      title: 'code style',
      content: 'FP first',
      filePath: join(vaultDir, 'style.md'),
      source: 'manual',
      layer: 'rule',
    });

    const rejection = removeNote(client, note.id, note.filePath, { actor: 'user' });
    expect(rejection).toBeUndefined();
    const row = client.sqlite.prepare('SELECT id FROM notes WHERE id = ?').get(note.id);
    expect(row).toBeFalsy();
  });
});

describe('saveNote — flashbacks', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-save-flash-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-save-flash-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it('returns flashbacks for older cross-category notes and persists them as flashback links', async () => {
    const old = insertNote(client, {
      title: 'Decision from last quarter',
      content: 'we picked JWT',
      filePath: join(vaultDir, 'old.md'),
      source: 'manual',
      layer: 'past',
      category: 'decisions',
    });
    client.sqlite
      .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
      .run(Date.now() - 120 * 86_400_000, old.id);
    saveEmbedding(client, old.id, new Array(768).fill(0.1));

    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'New project note',
      content: 'planning auth approach',
      source: 'manual',
      layer: 'state',
      folder: 'projects/auth',
    });
    if (isSaveRejection(result)) throw new Error('unexpected rejection');
    const { note, flashbacks } = result;

    expect(flashbacks.map((f) => f.id)).toContain(old.id);

    const links = client.sqlite
      .prepare('SELECT source FROM note_links WHERE source_id = ? AND target_id = ?')
      .all(note.id, old.id) as { source: string }[];
    expect(links.some((l) => l.source === 'flashback')).toBe(true);
  });
});

describe('saveNote — amendments', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-amend-core-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-amend-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  const save = (title: string, amends?: number) =>
    saveNote(client, stubEmbedder, vaultDir, {
      title,
      content: 'body',
      source: 'manual',
      layer: 'past',
      amends,
    });

  it('links the amendment to what it corrects', async () => {
    const original = await save('original');
    if (isSaveRejection(original)) throw new Error('unexpected rejection');
    const fix = await save('[Amendment] original', original.note.id);
    if (isSaveRejection(fix)) throw new Error('unexpected rejection');

    expect(fix.amended?.id).toBe(original.note.id);
    expect(getAmendments(client, original.note.id).map((a) => a.id)).toEqual([fix.note.id]);
  });

  it('reports an amends id that matches no note instead of linking nothing', async () => {
    const fix = await save('[Amendment] gone', 9999);
    if (isSaveRejection(fix)) throw new Error('unexpected rejection');

    expect(fix.amendsMissing).toBe(9999);
    expect(fix.amended).toBeUndefined();
  });

  it('saves normally when no correction is claimed', async () => {
    const plain = await save('plain');
    if (isSaveRejection(plain)) throw new Error('unexpected rejection');

    expect(plain.amended).toBeUndefined();
    expect(plain.amendsMissing).toBeUndefined();
  });
});

describe('semanticSearchMulti', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-multi-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const insert = (title: string, content: string, file: string) =>
    insertNote(client, {
      title,
      content,
      filePath: join(dbDir, file),
      source: 'manual',
      layer: 'past',
    });

  it('fuses results across query phrasings', async () => {
    const alpha = insert('alpha protocol', 'about alpha', 'a.md');
    const beta = insert('beta protocol', 'about beta', 'b.md');

    const results = await semanticSearchMulti(client, stubEmbedder, ['alpha', 'beta'], 5);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(alpha.id);
    expect(ids).toContain(beta.id);
  });

  it('returns the single-query result list unchanged for one phrasing', async () => {
    const alpha = insert('alpha protocol', 'about alpha', 'a.md');
    insert('beta protocol', 'about beta', 'b.md');

    const results = await semanticSearchMulti(client, stubEmbedder, ['alpha'], 5);
    expect(results[0]?.id).toBe(alpha.id);
    expect(results.map((r) => r.id)).not.toContain(undefined);
  });

  it('ranks notes matched by multiple phrasings higher', async () => {
    const both = insert('alpha beta summary', 'alpha beta', 'ab.md');
    const alphaOnly = insert('alpha protocol', 'only alpha here', 'a.md');

    const results = await semanticSearchMulti(client, stubEmbedder, ['alpha', 'beta'], 5);
    const ids = results.map((r) => r.id);
    expect(ids.indexOf(both.id)).toBeLessThan(ids.indexOf(alphaOnly.id));
  });

  it('lets the reranker reorder the fused pool', async () => {
    insert('alpha protocol', 'about alpha', 'a.md');
    const buried = insert('beta protocol', 'about beta', 'b.md');
    const preferBuried = async (_query: string, passages: string[]) =>
      passages.map((p) => (p.includes('beta') ? 1 : 0));

    const results = await semanticSearchMulti(client, stubEmbedder, ['alpha', 'beta'], 2, {
      reranker: preferBuried,
    });
    expect(results[0].id).toBe(buried.id);
    expect(results[0].rerankScore).toBe(1);
  });

  it('honours the limit after reranking a wider pool', async () => {
    insert('alpha one', 'about alpha', 'a1.md');
    insert('alpha two', 'about alpha', 'a2.md');
    insert('alpha three', 'about alpha', 'a3.md');
    const scoreZero = async (_query: string, passages: string[]) => passages.map(() => 0);

    const results = await semanticSearchMulti(client, stubEmbedder, ['alpha'], 2, {
      reranker: scoreZero,
    });
    expect(results).toHaveLength(2);
  });
});
