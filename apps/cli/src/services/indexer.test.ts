import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evidenceStaleness,
  getBacklinks,
  getNoteByFilePath,
  getNoteEvidence,
  listNotes,
  type MemexClient,
  openDb,
  syncExternalLayer,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexDirectory, isPlaceholderTitle } from './indexer.ts';

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

  const declare = (file: string, sourceIds: number[], body: string) =>
    writeFileSync(
      join(vaultDir, file),
      `---\ntitle: ${file.replace('.md', '')}\nlayer: state\nderives_from: [${sourceIds.join(', ')}]\n---\n\n${body}\n`,
      'utf8',
    );

  it('reads what a note declares it was built from', async () => {
    writeFileSync(join(vaultDir, 'source.md'), '# what happened\n\nwe chose JWT\n', 'utf8');
    writeFileSync(join(vaultDir, 'plan.md'), '# plan\n\nwe use JWT\n', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const source = getNoteByFilePath(client, join(vaultDir, 'source.md'));
    declare('plan.md', [source?.id ?? 0], 'we use JWT');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const plan = getNoteByFilePath(client, join(vaultDir, 'plan.md'));
    expect(getNoteEvidence(client, plan?.id ?? 0).map((e) => e.sourceId)).toEqual([source?.id]);
  });

  it('keeps the hash a source was declared with, so a later change still shows', async () => {
    writeFileSync(join(vaultDir, 'source.md'), '# a rule\n\nFP first\n', 'utf8');
    writeFileSync(join(vaultDir, 'plan.md'), '# plan\n\nwe write FP\n', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const source = getNoteByFilePath(client, join(vaultDir, 'source.md'));
    declare('plan.md', [source?.id ?? 0], 'we write FP');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const plan = getNoteByFilePath(client, join(vaultDir, 'plan.md'));
    expect(evidenceStaleness(client, plan?.id ?? 0)?.changed).toHaveLength(0);

    writeFileSync(join(vaultDir, 'source.md'), '# a rule\n\nOOP now\n', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    expect(evidenceStaleness(client, plan?.id ?? 0)?.changed).toHaveLength(1);
  });

  it('rebuilds the link graph, so a link written against a filename becomes an edge', async () => {
    writeFileSync(join(vaultDir, 'target.md'), '---\ntitle: Round-2/3 통과\n---\n\nbody', 'utf8');
    writeFileSync(join(vaultDir, 'source.md'), '# Source\n\nsee [[Round-2／3 통과]]', 'utf8');

    const stats = await indexDirectory(client, stubEmbedder, vaultDir);

    const target = getNoteByFilePath(client, join(vaultDir, 'target.md'));
    const source = getNoteByFilePath(client, join(vaultDir, 'source.md'));
    expect(stats.relinked).toBe(1);
    expect(getBacklinks(client, target?.id ?? 0).map((n) => n.id)).toEqual([source?.id]);
  });

  it('repairs a link that a rename broke in a file it never had to touch', async () => {
    writeFileSync(join(vaultDir, 'target.md'), '# Old Name\n\nbody', 'utf8');
    writeFileSync(join(vaultDir, 'source.md'), '# Source\n\nsee [[New Name]]', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const source = getNoteByFilePath(client, join(vaultDir, 'source.md'));
    expect(
      getBacklinks(client, getNoteByFilePath(client, join(vaultDir, 'target.md'))?.id ?? 0),
    ).toHaveLength(0);

    writeFileSync(join(vaultDir, 'target.md'), '# New Name\n\nbody', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const renamed = getNoteByFilePath(client, join(vaultDir, 'target.md'));
    expect(getBacklinks(client, renamed?.id ?? 0).map((n) => n.id)).toEqual([source?.id]);
  });

  it('reads a quoted title as the words it means, not the escapes it needed', async () => {
    writeFileSync(
      join(vaultDir, 'quoted.md'),
      '---\ntitle: "1인칭은 \\"필자\\""\n---\n\nbody\n',
      'utf8',
    );
    await indexDirectory(client, stubEmbedder, vaultDir);

    expect(listNotes(client, 50).map((n) => n.title)).toContain('1인칭은 "필자"');
  });

  it('leaves a backslash alone in a title that was never quoted', async () => {
    writeFileSync(
      join(vaultDir, 'regex.md'),
      '---\ntitle: 공백을 찾아내는 \\s 캐릭터 클래스\n---\n\nbody\n',
      'utf8',
    );
    await indexDirectory(client, stubEmbedder, vaultDir);

    expect(listNotes(client, 50).map((n) => n.title)).toContain(
      '공백을 찾아내는 \\s 캐릭터 클래스',
    );
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

  it('keeps an authored date the file cannot state', async () => {
    const filePath = join(vaultDir, 'undated.md');
    writeFileSync(filePath, '# Undated\n\nbody', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const note = getNoteByFilePath(client, filePath);
    expect(note?.authoredAt).toBeNull();
    if (!note) return;

    const backfilled = Date.parse('2019-03-04');
    client.sqlite.prepare('UPDATE notes SET authored_at = ? WHERE id = ?').run(backfilled, note.id);

    await indexDirectory(client, stubEmbedder, vaultDir, undefined, true);

    expect(getNoteByFilePath(client, filePath)?.authoredAt).toBe(backfilled);
  });

  it('lets the frontmatter date overrule a stored authored date', async () => {
    const filePath = join(vaultDir, 'dated.md');
    writeFileSync(filePath, '---\ntitle: Dated\ndate: 2021-07-09\n---\n\nbody', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    const note = getNoteByFilePath(client, filePath);
    expect(note?.authoredAt).toBe(Date.parse('2021-07-09'));
    if (!note) return;

    client.sqlite
      .prepare('UPDATE notes SET authored_at = ? WHERE id = ?')
      .run(Date.parse('2001-01-01'), note.id);
    await indexDirectory(client, stubEmbedder, vaultDir, undefined, true);

    expect(getNoteByFilePath(client, filePath)?.authoredAt).toBe(Date.parse('2021-07-09'));
  });

  it('reads whether a rule is in effect off the file', async () => {
    const filePath = join(vaultDir, 'policy.md');
    writeFileSync(
      filePath,
      '---\ntitle: Search policy\nlayer: rule\nrule_status: canonical\n---\n\nalways search first',
      'utf8',
    );
    await indexDirectory(client, stubEmbedder, vaultDir);

    const note = getNoteByFilePath(client, filePath);
    expect(note?.layer).toBe('rule');
    expect(note?.ruleStatus).toBe('canonical');
  });

  it('leaves a rule the file says nothing about out of effect', async () => {
    const filePath = join(vaultDir, 'proposal.md');
    writeFileSync(filePath, '---\ntitle: Proposal\nlayer: rule\n---\n\nmaybe do this', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    expect(getNoteByFilePath(client, filePath)?.ruleStatus).toBeNull();
  });

  it('reads where a rule applies off the file', async () => {
    const filePath = join(vaultDir, 'scoped.md');
    writeFileSync(
      filePath,
      '---\ntitle: Scoped\nlayer: rule\nrule_status: canonical\nrule_scope: folder:coding\n---\n\nbody',
      'utf8',
    );
    await indexDirectory(client, stubEmbedder, vaultDir);

    expect(getNoteByFilePath(client, filePath)?.ruleScope).toBe('folder:coding');
  });

  it('reads when a projection was last stood behind off the file', async () => {
    const filePath = join(vaultDir, 'projection.md');
    writeFileSync(
      filePath,
      '---\ntitle: Projection\nlayer: state\nconfirmed_at: 2026-09-04T05:32:11.000Z\n---\n\nbody',
      'utf8',
    );
    await indexDirectory(client, stubEmbedder, vaultDir);

    const note = getNoteByFilePath(client, filePath);
    expect(note?.layer).toBe('state');
    expect(note?.confirmedAt).toBe(Date.parse('2026-09-04T05:32:11.000Z'));
  });

  it('leaves a note the file says nothing about unconfirmed', async () => {
    const filePath = join(vaultDir, 'unconfirmed.md');
    writeFileSync(filePath, '---\ntitle: Unconfirmed\nlayer: state\n---\n\nbody', 'utf8');
    await indexDirectory(client, stubEmbedder, vaultDir);

    expect(getNoteByFilePath(client, filePath)?.confirmedAt).toBeNull();
  });

  it('calls a note from outside the vault external, whatever its frontmatter says', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'memex-indexer-source-'));
    const mine = join(vaultDir, 'mine.md');
    const borrowed = join(outside, 'README.md');
    writeFileSync(mine, '---\ntitle: Mine\nlayer: state\n---\n\nstill true', 'utf8');
    writeFileSync(borrowed, '---\ntitle: Readme\nlayer: state\n---\n\nnot mine to shape', 'utf8');

    await indexDirectory(client, stubEmbedder, vaultDir);
    await indexDirectory(client, stubEmbedder, outside);
    expect(syncExternalLayer(client, vaultDir)).toEqual({ external: 1 });

    expect(getNoteByFilePath(client, mine)?.layer).toBe('state');
    expect(getNoteByFilePath(client, borrowed)?.layer).toBe('external');

    rmSync(outside, { recursive: true, force: true });
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

// A blog repository ships the skeleton its posts are made from, and memex reads
// that repository. The skeleton is not one of the posts.
describe('template files', () => {
  it('knows a placeholder title from a real one', () => {
    expect(isPlaceholderTitle('$title')).toBe(true);
    expect(isPlaceholderTitle('{{ title }}')).toBe(true);
    expect(isPlaceholderTitle('<%* tp.file.title %>')).toBe(true);
    expect(isPlaceholderTitle('  $TITLE')).toBe(true);
  });

  // The rule has to be narrow enough that a note about money, or one that opens
  // with a wiki link, is still a note.
  it('leaves alone a title that merely starts oddly', () => {
    expect(isPlaceholderTitle('$5만 디컨센트레이션 코어 매수')).toBe(false);
    expect(isPlaceholderTitle('[[Obsidian]] 정합성 재편')).toBe(false);
    expect(isPlaceholderTitle('memex 저장 아키텍처')).toBe(false);
  });
});
