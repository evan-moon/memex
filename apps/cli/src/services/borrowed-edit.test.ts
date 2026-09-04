import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editNote, isEditRejection } from '@memex/core';
import { getNoteByFilePath, type MemexClient, openDb, syncExternalLayer } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexDirectory } from './indexer.ts';

const stubEmbedder = async (): Promise<number[]> => new Array(768).fill(0.1);

// A real blog post: the head is a static site generator's input, and nothing in
// it belongs to memex.
const POST = `---
title: Tools Live On After Leaving Their Maker
subTitle: Rethinking function calls while building MCP tools
date: 2026-04-28 00:00:00
tags:
  - MCP
  - Tool Calling
---

첫 문단이다.

둘째 문단이다.
`;

describe('a borrowed file is the person to edit, never the agent', () => {
  let dbDir: string;
  let vaultDir: string;
  let blogDir: string;
  let client: MemexClient;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-borrowed-db-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'memex-borrowed-vault-'));
    blogDir = mkdtempSync(join(tmpdir(), 'memex-borrowed-blog-'));
    client = openDb(dbDir);
    writeFileSync(join(blogDir, 'post.md'), POST, 'utf8');
    await indexDirectory(client, stubEmbedder, blogDir);
    syncExternalLayer(client, vaultDir);
  });

  afterEach(() => {
    client.sqlite.close();
    for (const dir of [dbDir, vaultDir, blogDir]) rmSync(dir, { recursive: true, force: true });
  });

  const post = () => getNoteByFilePath(client, join(blogDir, 'post.md'));

  it('refuses the agent, and says who can', async () => {
    const note = post();
    if (!note) throw new Error('not indexed');

    const result = await editNote(client, stubEmbedder, vaultDir, note.id, {
      content: POST.replace('첫 문단이다.', '에이전트가 고쳤다.'),
    });

    expect(isEditRejection(result)).toBe(true);
    if (isEditRejection(result)) expect(result.error).toBe('EXTERNAL_SOURCE');
    expect(readFileSync(join(blogDir, 'post.md'), 'utf8')).toContain('첫 문단이다.');
  });

  it('lets the person through', async () => {
    const note = post();
    if (!note) throw new Error('not indexed');

    const result = await editNote(
      client,
      stubEmbedder,
      vaultDir,
      note.id,
      { content: POST.replace('첫 문단이다.', '내가 고쳤다.') },
      { actor: 'user' },
    );

    expect(isEditRejection(result)).toBe(false);
    expect(readFileSync(join(blogDir, 'post.md'), 'utf8')).toContain('내가 고쳤다.');
  });

  // The real risk the old refusal was pointing at, wrongly. `renderNoteFile`
  // syncs the fields memex owns, and `layer: external` printed among a post's
  // own frontmatter is memex vandalising a file it only borrowed.
  it('does not print its own fields into a head it does not own', async () => {
    const note = post();
    if (!note) throw new Error('not indexed');

    await editNote(
      client,
      stubEmbedder,
      vaultDir,
      note.id,
      { content: POST.replace('첫 문단이다.', '내가 고쳤다.') },
      { actor: 'user' },
    );

    const onDisk = readFileSync(join(blogDir, 'post.md'), 'utf8');
    expect(onDisk).not.toContain('layer:');
    expect(onDisk).not.toContain('confirmed_at:');
    expect(onDisk).not.toContain('rule_status:');
    expect(onDisk).toContain('subTitle: Rethinking function calls while building MCP tools');
    expect(onDisk).toContain('date: 2026-04-28 00:00:00');
  });

  // The stated reason for refusing was that the next index undoes the edit.
  // It does not: filePath on an indexed note is the real file.
  it('survives the next index rather than being undone by it', async () => {
    const note = post();
    if (!note) throw new Error('not indexed');

    await editNote(
      client,
      stubEmbedder,
      vaultDir,
      note.id,
      { content: POST.replace('첫 문단이다.', '내가 고쳤다.') },
      { actor: 'user' },
    );
    await indexDirectory(client, stubEmbedder, blogDir, undefined, true);
    syncExternalLayer(client, vaultDir);

    expect(readFileSync(join(blogDir, 'post.md'), 'utf8')).toContain('내가 고쳤다.');
    expect(post()?.content).toContain('내가 고쳤다.');
  });
});
