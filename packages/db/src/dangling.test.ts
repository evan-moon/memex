import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  classifyDangling,
  danglingLinks,
  dismissDanglingFor,
  restoreDanglingFor,
} from './dangling.ts';
import { insertNote, updateNote } from './repository.ts';
import { detectDanglingLinks } from './signals.ts';

const titles = ['Obsidian 정합성 재편', 'memex', '모순 탐지 — 낡음 다음에 오는 것'];

const classify = (target: string, filePath = '/vault/notes/a.md') =>
  classifyDangling({ noteId: 1, target, filePath }, titles);

describe('classifyDangling', () => {
  it('reads the link conventions own counterexamples as placeholders', () => {
    for (const target of ['Title', 'Exact Note Title', 'some-memory-key', '1234'])
      expect(classify(target).kind).toBe('placeholder');
  });

  it('treats anything a rule or plan document links to as an example', () => {
    expect(classify('부채 명세서', '/repo/CLAUDE.md').kind).toBe('placeholder');
    expect(classify('부채 명세서', '/repo/docs/plans/x.md').kind).toBe('placeholder');
    expect(classify('부채 명세서', '/repo/README.md').kind).toBe('placeholder');
  });

  it('calls a near miss on an existing title a typo, and says which', () => {
    const link = classify('Obsidian 정합성 재편본');

    expect(link.kind).toBe('typo');
    expect(link.nearest).toBe('Obsidian 정합성 재편');
  });

  it('calls a link to something nobody wrote a forward link, not a mistake', () => {
    expect(classify('아직 안 쓴 노트').kind).toBe('forward');
  });

  it('does not call a note a typo of itself', () => {
    expect(classify('memex').kind).toBe('forward');
  });

  it('keeps a genuinely different title out of typo range', () => {
    expect(classify('모순 탐지').kind).toBe('forward');
  });

  it('will not call a short word a typo of another short word', () => {
    // At distance 2 every two-character string is a "typo" of every other.
    expect(
      classifyDangling({ noteId: 1, target: '강훈', filePath: '/v/a.md' }, ['가온']).kind,
    ).toBe('forward');
  });

  it('reads the Korean words that name a link as placeholders too', () => {
    for (const target of ['링크', '제목', '이름'])
      expect(classify(target).kind).toBe('placeholder');
  });

  it('reads a note that merely lives near docs as an ordinary note', () => {
    expect(classify('아직 안 쓴 노트', '/vault/documentation/a.md').kind).toBe('forward');
  });
});

describe('class-level dismissal', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-dangling-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const add = (title: string, content: string) =>
    insertNote(client, {
      title,
      content,
      filePath: join(dbDir, `${title}.md`),
      source: 'manual',
      layer: 'past',
    });

  it('drops every dead link a note has, not just the ones it has today', () => {
    const note = add('a plan', 'links [[nowhere]] and [[elsewhere]]');
    expect(danglingLinks(client)).toHaveLength(2);

    dismissDanglingFor(client, note.id);
    expect(danglingLinks(client)).toEqual([]);

    updateNote(client, note.id, { content: 'links [[nowhere]], [[elsewhere]] and [[a third]]' });
    expect(danglingLinks(client)).toEqual([]);
  });

  it('leaves other notes alone', () => {
    const dismissed = add('a plan', 'links [[nowhere]]');
    add('another plan', 'links [[somewhere else]]');

    dismissDanglingFor(client, dismissed.id);

    expect(danglingLinks(client).map((l) => l.target)).toEqual(['somewhere else']);
  });

  it('can be taken back', () => {
    const note = add('a plan', 'links [[nowhere]]');
    dismissDanglingFor(client, note.id);
    restoreDanglingFor(client, note.id);

    expect(danglingLinks(client)).toHaveLength(1);
  });

  it('stops the detector raising the signal again', () => {
    const note = add('a plan', 'links [[nowhere]]');
    expect(detectDanglingLinks(client)).toHaveLength(1);

    dismissDanglingFor(client, note.id);
    expect(detectDanglingLinks(client)).toEqual([]);
  });
});
