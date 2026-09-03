import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  countRetrievals,
  getAmendments,
  getNote,
  getNoteCard,
  getNoteTypeLabel,
  insertNote,
  type MemexClient,
  openDb,
  retrievalCounts,
  saveEmbedding,
} from '@memex/db';
import { parseInvalidates } from '@memex/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  editNote,
  isEditRejection,
  isSaveRejection,
  removeNote,
  renderNoteFile,
  saveNote,
  searchPage,
  semanticSearchMulti,
} from './note.ts';

const stubEmbedder = async (): Promise<number[]> => new Array(768).fill(0.1);

describe('renderNoteFile', () => {
  const meta = {
    tags: [],
    layer: 'past' as const,
    ruleStatus: null,
    date: Date.parse('2026-06-11'),
  };

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

  it('writes whether a rule is in effect into the file', () => {
    const file = renderNoteFile({
      ...meta,
      layer: 'rule',
      ruleStatus: 'provisional',
      title: 'Search policy',
      content: 'always search first',
    });
    expect(file).toContain('layer: rule\nrule_status: provisional');
  });

  it('says nothing about rule status on a layer that has none', () => {
    const file = renderNoteFile({ ...meta, title: 'A Note', content: 'body' });
    expect(file).not.toContain('rule_status');
  });

  it('syncs the status of a rule that came back through the index', () => {
    const content = '---\ntitle: Search policy\nlayer: rule\nrule_status: provisional\n---\n\nbody';
    const file = renderNoteFile({
      ...meta,
      layer: 'rule',
      ruleStatus: 'canonical',
      title: 'Search policy',
      content,
    });
    expect(file).toBe(
      '---\ntitle: Search policy\nlayer: rule\nrule_status: canonical\n---\n\nbody',
    );
  });

  it('drops the status line when a rule is declined out of the layer', () => {
    const content = '---\ntitle: Search policy\nlayer: rule\nrule_status: canonical\n---\n\nbody';
    const file = renderNoteFile({ ...meta, layer: 'state', title: 'Search policy', content });
    expect(file).toBe('---\ntitle: Search policy\nlayer: state\n---\n\nbody');
  });

  it('writes the layer into a file that would come back as past without it', () => {
    const content = '---\ntitle: Old\ndate: 2026-01-02\n---\n\nbody';
    const file = renderNoteFile({ ...meta, layer: 'state', title: 'New', content });
    expect(file).toBe('---\ntitle: New\ndate: 2026-01-02\nlayer: state\n---\n\nbody');
  });

  it('leaves a past note to the column default rather than restating it', () => {
    const content = '---\ntitle: Old\ndate: 2026-01-02\n---\n\nbody';
    const file = renderNoteFile({ ...meta, title: 'New', content });
    expect(file).not.toContain('layer:');
  });

  it('gives a state note with no frontmatter a header to say so', () => {
    const file = renderNoteFile({
      ...meta,
      layer: 'state',
      title: 'Roadmap',
      content: '# Roadmap\n\nstill true',
    });
    expect(file).toBe('---\ntitle: Roadmap\nlayer: state\n---\n\n# Roadmap\n\nstill true');
  });

  it('gives a rule with no frontmatter somewhere to record its status', () => {
    const file = renderNoteFile({
      ...meta,
      layer: 'rule',
      ruleStatus: 'canonical',
      title: 'Search policy',
      content: '# Search policy\n\nalways search first',
    });
    expect(file).toBe(
      '---\ntitle: Search policy\nlayer: rule\nrule_status: canonical\n---\n\n# Search policy\n\nalways search first',
    );
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

describe('saveNote — filename is what a wiki link resolves against', () => {
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
      type: '미분류',
    });
    expect(isSaveRejection(result)).toBe(false);
    expect(readdirSync(vaultDir)).toContain(`${title}.md`);
  });

  it('keeps a note inside the vault however the folder is written', async () => {
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'Escaped',
      content: 'a body long enough to be a note',
      source: 'claude-code',
      layer: 'past',
      type: '학습메모',
      folder: '../../../../tmp/escaped',
    });
    expect(isSaveRejection(result)).toBe(false);
    if (isSaveRejection(result)) return;
    expect(result.note.filePath.startsWith(`${vaultDir}/`)).toBe(true);
    expect(result.note.filePath).toBe(join(vaultDir, 'tmp', 'escaped', 'Escaped.md'));
  });

  it('writes a slashed title as one file, not a folder and a file', async () => {
    const title = '광교센트럴뷰(1억/280) 대안 부상 (2026-07-01)';
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title,
      content: 'a body long enough to be a note',
      source: 'claude-code',
      layer: 'past',
      type: '학습메모',
    });
    expect(isSaveRejection(result)).toBe(false);
    if (isSaveRejection(result)) return;
    expect(dirname(result.note.filePath)).toBe(vaultDir);
    expect(readdirSync(vaultDir)).toContain('광교센트럴뷰(1억／280) 대안 부상 (2026-07-01).md');
    // The title still reads with the real slash, and an alias carries the link.
    expect(result.note.title).toBe(title);
  });

  it('numbers a colliding filename instead of appending a timestamp', async () => {
    for (const _ of [1, 2]) {
      await saveNote(client, stubEmbedder, vaultDir, {
        title: 'Same Title',
        content: 'body',
        source: 'claude-code',
        layer: 'past',
        type: '미분류',
      });
    }
    expect(readdirSync(vaultDir).sort()).toEqual(['Same Title (2).md', 'Same Title.md']);
  });
});

describe('saveNote — document type', () => {
  let dbDir: string;
  let vaultDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-type-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-type-vault-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  const save = (over: Record<string, unknown>) =>
    saveNote(client, stubEmbedder, vaultDir, {
      title: 'a note',
      content: 'body',
      source: 'claude-code' as const,
      layer: 'past' as const,
      type: '미분류' as const,
      ...over,
    });

  it('refuses a note that is a title and nothing else', async () => {
    const result = await save({ content: '' });
    expect(isSaveRejection(result)).toBe(true);
    if (isSaveRejection(result)) expect(result.error).toBe('EMPTY_BODY');
  });

  it('refuses a note whose only body is its own metadata and title', async () => {
    const shell = '---\ntitle: a note\ncategory: memory\n---\n\n# a note\n';
    const result = await save({ content: shell });
    expect(isSaveRejection(result)).toBe(true);
    if (isSaveRejection(result)) expect(result.error).toBe('EMPTY_BODY');
  });

  it('takes a note that carries one real line', async () => {
    const result = await save({ content: 'LG 울트라파인 5k, 중고로 사는 것을 추천' });
    expect(isSaveRejection(result)).toBe(false);
  });

  it('asks a person for no sections at all — a correction is not a form', async () => {
    const result = await save({
      type: '세션기록',
      content: '아까 그거 opula 아니고 firma였어요',
      actor: 'user',
    });
    expect(isSaveRejection(result)).toBe(false);
  });

  it('still refuses a person an empty note — that is not a template, it is nothing', async () => {
    const result = await save({ type: '학습메모', content: '   ', actor: 'user' });
    expect(isSaveRejection(result)).toBe(true);
    if (isSaveRejection(result)) expect(result.error).toBe('EMPTY_BODY');
  });

  it('refuses a typed note that is missing its sections, and names them', async () => {
    const result = await save({ type: '세션기록', content: '## Resume\n\n여기부터' });
    expect(isSaveRejection(result)).toBe(true);
    if (!isSaveRejection(result)) return;
    expect(result).toMatchObject({
      error: 'SLOTS_MISSING',
      missingSlots: ['오늘 한 작업', '왜', '다음 작업'],
    });
    expect(result.message).toContain('## 다음 작업');
    expect(readdirSync(vaultDir)).toEqual([]);
  });

  it('saves a typed note whose sections are all there', async () => {
    const content = '## Resume\na\n## 오늘 한 작업\nb\n## 왜\nc\n## 다음 작업\nd';
    const result = await save({ type: '세션기록', content });
    expect(isSaveRejection(result)).toBe(false);
    if (isSaveRejection(result)) return;
    expect(getNote(client, result.note.id)?.type).toBe('세션기록');
  });

  it('asks nothing of a type that carries no sections', async () => {
    const result = await save({ type: '학습메모', content: 'just a paragraph about a thing' });
    expect(isSaveRejection(result)).toBe(false);
  });

  it('gives a saved note its label and card without a reindex', async () => {
    const result = await save({
      type: '학습메모',
      content: '스프레드는 인자를 건드리지 않고 새 객체를 만든다.',
    });
    if (isSaveRejection(result)) return;
    expect(getNoteTypeLabel(client, result.note.id)).toMatchObject({
      type: '학습메모',
      method: 'declared',
    });
    expect(getNoteCard(client, result.note.id)).toMatchObject({
      line: '스프레드는 인자를 건드리지 않고 새 객체를 만든다.',
      quality: 'good',
    });
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
      type: '미분류',
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
      type: '미분류',
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
      type: '미분류',
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
      type: '미분류',
    });

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, {
      content: 'OOP first',
    });
    expect(isEditRejection(result)).toBe(true);
    if (!isEditRejection(result)) return;
    expect(result.error).toBe('RULE_USER_ONLY');
  });

  it('refuses an agent edit that takes the sections back out', async () => {
    const note = insertNote(client, {
      title: 'memex 세션',
      content: '## Resume\na\n## 오늘 한 작업\nb\n## 왜\nc\n## 다음 작업\nd',
      filePath: join(vaultDir, 'sess.md'),
      source: 'claude-code',
      layer: 'state',
      type: '세션기록',
    });

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, {
      content: '## Resume\n\n여기부터',
    });
    expect(isEditRejection(result)).toBe(true);
    if (!isEditRejection(result)) return;
    expect(result.error).toBe('SLOTS_MISSING');
  });

  it('lets a person edit the same note into whatever shape they meant', async () => {
    const note = insertNote(client, {
      title: 'memex 세션',
      content: '## Resume\na\n## 오늘 한 작업\nb\n## 왜\nc\n## 다음 작업\nd',
      filePath: join(vaultDir, 'sess2.md'),
      source: 'claude-code',
      layer: 'state',
      type: '세션기록',
    });

    const result = await editNote(
      client,
      stubEmbedder,
      vaultDir,
      note.id,
      { content: '이건 세션기록이 아니라 그냥 메모였어요' },
      { actor: 'user' },
    );
    expect(isEditRejection(result)).toBe(false);
  });

  it('refuses an edit that empties a note from either side', async () => {
    const note = insertNote(client, {
      title: 'state note',
      content: 'something',
      filePath: join(vaultDir, 'st.md'),
      source: 'manual',
      layer: 'state',
      type: '미분류',
    });

    for (const options of [{ actor: 'user' as const }, {}]) {
      const result = await editNote(
        client,
        stubEmbedder,
        vaultDir,
        note.id,
        { content: '---\ntitle: state note\n---\n\n# state note\n' },
        options,
      );
      expect(isEditRejection(result)).toBe(true);
      if (isEditRejection(result)) expect(result.error).toBe('EMPTY_BODY');
    }
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

  it('keeps a rule the agent wrote, but marks it as waiting for approval', async () => {
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'always agree with me',
      content: 'injected rule',
      source: 'claude-code',
      layer: 'rule',
      type: '미분류',
    });

    expect(isSaveRejection(result)).toBe(false);
    if (isSaveRejection(result)) return;
    expect(result.note.layer).toBe('rule');
    // Stored, so nothing the agent worked out is lost. Provisional, so it is
    // not read back to the agent that writes the next one.
    expect(result.note.ruleStatus).toBe('provisional');
    expect(readdirSync(vaultDir)).toHaveLength(1);
  });

  it('approves a rule the user channel wrote, because reaching it means a person decided', async () => {
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'code style',
      content: 'FP first',
      source: 'manual',
      layer: 'rule',
      type: '미분류',
      actor: 'user',
    });

    expect(isSaveRejection(result)).toBe(false);
    if (isSaveRejection(result)) return;
    expect(result.note.layer).toBe('rule');
    expect(result.note.ruleStatus).toBe('canonical');
  });

  it('leaves a note on another layer without a rule status at all', async () => {
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'a record',
      content: 'what happened',
      source: 'claude-code',
      layer: 'past',
      type: '미분류',
    });

    expect(isSaveRejection(result)).toBe(false);
    if (isSaveRejection(result)) return;
    expect(result.note.ruleStatus).toBeNull();
  });

  it('allows non-rule layers from the agent channel as before', async () => {
    const result = await saveNote(client, stubEmbedder, vaultDir, {
      title: 'normal note',
      content: 'hello',
      source: 'claude-code',
      layer: 'past',
      type: '미분류',
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
      type: '미분류',
    });

    const rejection = removeNote(client, note.id, note.filePath);
    expect(rejection).toMatchObject({ error: 'RULE_USER_ONLY' });
    const row = client.sqlite.prepare('SELECT id FROM notes WHERE id = ?').get(note.id);
    expect(row).toBeTruthy();
  });

  it('rejects a rule edit from the agent channel', async () => {
    const note = insertNote(client, {
      title: 'code style',
      content: 'FP first',
      filePath: join(vaultDir, 'style.md'),
      source: 'manual',
      layer: 'rule',
      type: '미분류',
    });

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, { content: 'OOP now' });
    expect(result).toMatchObject({ error: 'RULE_USER_ONLY' });
  });

  it('allows a rule edit from the user channel, the way creating and deleting one already were', async () => {
    const note = insertNote(client, {
      title: 'code style',
      content: 'FP first',
      filePath: join(vaultDir, 'style.md'),
      source: 'manual',
      layer: 'rule',
      type: '미분류',
    });

    const result = await editNote(
      client,
      stubEmbedder,
      vaultDir,
      note.id,
      { content: 'FP first, always' },
      { actor: 'user' },
    );
    expect(isEditRejection(result)).toBe(false);
    expect(getNote(client, note.id)?.content).toBe('FP first, always');
  });

  it('refuses to promote a note into a rule from the agent channel', async () => {
    const note = insertNote(client, {
      title: 'a plan',
      content: 'do the thing',
      filePath: join(vaultDir, 'plan.md'),
      source: 'claude-code',
      layer: 'state',
      type: '미분류',
    });

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, { layer: 'rule' });
    expect(result).toMatchObject({ error: 'RULE_USER_ONLY' });
    expect(getNote(client, note.id)?.layer).toBe('state');
  });

  it('moves a layer in the file as well as the row, so a reindex agrees', async () => {
    const note = insertNote(client, {
      title: 'a plan',
      content: 'do the thing',
      filePath: join(vaultDir, 'plan.md'),
      source: 'manual',
      layer: 'state',
      type: '미분류',
    });

    await editNote(client, stubEmbedder, vaultDir, note.id, { layer: 'rule' }, { actor: 'user' });

    expect(getNote(client, note.id)?.layer).toBe('rule');
    expect(readFileSync(note.filePath, 'utf8')).toContain('layer: rule');
  });

  it('allows rule deletion from the user channel (actor: user)', async () => {
    const note = insertNote(client, {
      title: 'code style',
      content: 'FP first',
      filePath: join(vaultDir, 'style.md'),
      source: 'manual',
      layer: 'rule',
      type: '미분류',
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
      type: '미분류',
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
      type: '미분류',
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

  const save = (
    title: string,
    amends?: number,
    amendKind?: 'corrects' | 'continues',
    invalidates?: string[],
  ) =>
    saveNote(client, stubEmbedder, vaultDir, {
      title,
      content: 'body',
      source: 'manual',
      layer: 'past',
      type: '미분류',
      amends,
      amendKind,
      invalidates,
    });

  const edgeBetween = (from: number, to: number) =>
    (
      client.sqlite
        .prepare('SELECT source FROM note_links WHERE source_id = ? AND target_id = ?')
        .get(from, to) as { source: string } | undefined
    )?.source;

  // A caller that does not say gets the weaker of the two claims. Calling a note
  // wrong because nobody said otherwise is the failure the split exists to end:
  // a count of 74 pairs found 58% were continuations shown as corrections.
  it('continues by default rather than corrects', async () => {
    const original = await save('original');
    if (isSaveRejection(original)) throw new Error('unexpected rejection');
    const later = await save('more about it', original.note.id);
    if (isSaveRejection(later)) throw new Error('unexpected rejection');

    expect(edgeBetween(later.note.id, original.note.id)).toBe('continues');
  });

  it('writes a correction when the caller says it is one', async () => {
    const original = await save('original');
    if (isSaveRejection(original)) throw new Error('unexpected rejection');
    const fix = await save('what it actually was', original.note.id, 'corrects');
    if (isSaveRejection(fix)) throw new Error('unexpected rejection');

    expect(edgeBetween(fix.note.id, original.note.id)).toBe('corrects');
  });

  it('links the amendment to what it corrects', async () => {
    const original = await save('original');
    if (isSaveRejection(original)) throw new Error('unexpected rejection');
    const fix = await save('[Amendment] original', original.note.id);
    if (isSaveRejection(fix)) throw new Error('unexpected rejection');

    expect(fix.amended?.id).toBe(original.note.id);
    expect(getAmendments(client, original.note.id).map((a) => a.id)).toEqual([fix.note.id]);
  });

  it('settles the kind as corrects when the note names what stopped being true', async () => {
    const original = await save('original');
    if (isSaveRejection(original)) throw new Error('unexpected rejection');
    const fix = await save('[Amendment] narrower', original.note.id, undefined, [
      'the whole vault holds only 3~4 discoveries a month',
    ]);
    if (isSaveRejection(fix)) throw new Error('unexpected rejection');

    expect(edgeBetween(fix.note.id, original.note.id)).toBe('corrects');
    expect(getAmendments(client, original.note.id)[0].invalidates).toEqual([
      'the whole vault holds only 3~4 discoveries a month',
    ]);
  });

  it('leaves the claims in the file so a reindex can find them again', async () => {
    const original = await save('original');
    if (isSaveRejection(original)) throw new Error('unexpected rejection');
    const fix = await save('[Amendment] narrower', original.note.id, undefined, ['one claim']);
    if (isSaveRejection(fix)) throw new Error('unexpected rejection');

    expect(parseInvalidates(readFileSync(fix.note.filePath, 'utf8'))).toEqual(['one claim']);
  });

  it('keeps continues when a note adds without naming anything as wrong', async () => {
    const original = await save('original');
    if (isSaveRejection(original)) throw new Error('unexpected rejection');
    const later = await save('more about it', original.note.id, undefined, []);
    if (isSaveRejection(later)) throw new Error('unexpected rejection');

    expect(edgeBetween(later.note.id, original.note.id)).toBe('continues');
    expect(later.invalidates).toBeUndefined();
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
      type: '미분류',
    });

  it('records the fused page once, not once per query phrasing', async () => {
    insert('alpha protocol', 'about alpha', 'a.md');
    insert('beta protocol', 'about beta', 'b.md');

    const results = await semanticSearchMulti(client, stubEmbedder, ['alpha', 'beta'], 5, {
      surface: 'mcp',
    });
    expect(countRetrievals(client)).toBe(results.length);
    expect(retrievalCounts(client).every((c) => c.hits === 1)).toBe(true);
  });

  it('records nothing when no surface asked to be recorded', async () => {
    insert('alpha protocol', 'about alpha', 'a.md');
    await semanticSearchMulti(client, stubEmbedder, ['alpha'], 5);
    await searchPage(client, stubEmbedder, 'alpha', 5);
    expect(countRetrievals(client)).toBe(0);
  });

  it('records a single-query page under the surface that asked for it', async () => {
    const alpha = insert('alpha protocol', 'about alpha', 'a.md');
    await searchPage(client, stubEmbedder, 'alpha', 5, { surface: 'ui' });
    const rows = client.sqlite
      .prepare('SELECT note_id AS noteId, surface, query FROM retrieval_log')
      .all();
    expect(rows).toContainEqual({ noteId: alpha.id, surface: 'ui', query: 'alpha' });
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

describe('borrowed notes', () => {
  let dbDir: string;
  let vaultDir: string;
  let outsideDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-borrowed-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-borrowed-vault-'));
    outsideDir = mkdtempSync(join(tmpdir(), 'memex-borrowed-outside-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    for (const dir of [dbDir, vaultDir, outsideDir]) rmSync(dir, { recursive: true, force: true });
  });

  const indexedFrom = (dir: string) => {
    const filePath = join(dir, 'post.md');
    writeFileSync(filePath, '# post\n\nbody\n', 'utf8');
    return insertNote(client, {
      title: 'post',
      content: '# post\n\nbody\n',
      filePath,
      source: 'index',
      layer: 'state',
      type: '미분류',
    });
  };

  it('refuses to edit a note the next index would overwrite', async () => {
    const note = indexedFrom(outsideDir);

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, { content: 'mine now' });

    expect(result).toMatchObject({ error: 'EXTERNAL_SOURCE' });
    expect(readFileSync(note.filePath, 'utf8')).toContain('body');
  });

  it('offers a note of its own instead, with the borrowed one as its source', async () => {
    const note = indexedFrom(outsideDir);

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, { content: 'mine now' });

    expect(
      isEditRejection(result) && result.error === 'EXTERNAL_SOURCE' && result.suggestion,
    ).toMatchObject({ action: 'save_note', layer: 'state', derivesFrom: [note.id] });
  });

  it('will not delete the original file to forget a borrowed note', () => {
    const note = indexedFrom(outsideDir);

    const rejection = removeNote(client, note.id, note.filePath, { vaultPath: vaultDir });

    expect(rejection).toMatchObject({ error: 'EXTERNAL_SOURCE' });
    expect(readFileSync(note.filePath, 'utf8')).toContain('body');
    expect(getNote(client, note.id)).toBeTruthy();
  });

  it('still edits a note that lives in the vault', async () => {
    const note = indexedFrom(vaultDir);

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, { content: 'mine now' });

    expect(isEditRejection(result)).toBe(false);
  });
});
