import { openDb } from '@memex/db';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bodyOf, listByLayer } from './notes.ts';

describe('bodyOf', () => {
  it('drops the frontmatter block', () => {
    const content = ['---', 'title: 제목', 'tags: [a]', '---', '', '본문이다.', ''].join('\n');
    expect(bodyOf(content, '제목')).toBe('본문이다.\n');
  });

  it('drops an H1 that only repeats the title', () => {
    const content = ['---', 'title: 제목', '---', '', '# 제목', '', '본문이다.', ''].join('\n');
    expect(bodyOf(content, '제목')).toBe('본문이다.\n');
  });

  it('keeps an H1 that says something the title does not', () => {
    const content = ['---', 'title: 제목', '---', '', '# 다른 제목', '', '본문.', ''].join('\n');
    expect(bodyOf(content, '제목')).toContain('# 다른 제목');
  });

  it('leaves a note that has no frontmatter alone', () => {
    expect(bodyOf('그냥 본문.\n', '제목')).toBe('그냥 본문.\n');
  });

  it('does not treat a leading horizontal rule as frontmatter', () => {
    expect(bodyOf('---\n\n본문.\n', '제목')).toBe('---\n\n본문.\n');
  });

  it('returns empty for a frontmatter-only stub', () => {
    expect(bodyOf(['---', 'title: $title', 'tags:', '---', ''].join('\n'), '$title')).toBe('');
  });
});

describe('listByLayer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-sidebar-'));
  const client = openDb(dir);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const day = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const insert = client.sqlite.prepare(
    `INSERT INTO notes (id, title, content, category, tags, layer, file_path,
                        created_at, updated_at, authored_at, source)
     VALUES (?, ?, '', '', '[]', ?, ?, ?, ?, ?, 'manual')`,
  );

  // Authored long ago, revised yesterday — the case that made the sidebar
  // disagree with its own warning icons.
  insert.run(1, 'old note, freshly revised', 'state', '/a.md', day('2026-01-01'), day('2026-08-20'), day('2026-01-01'));
  insert.run(2, 'newer note, untouched since', 'state', '/b.md', day('2026-06-01'), day('2026-06-01'), day('2026-06-01'));
  insert.run(3, 'happened later', 'past', '/c.md', day('2026-01-01'), day('2026-08-20'), day('2026-07-01'));
  insert.run(4, 'happened first', 'past', '/d.md', day('2026-01-01'), day('2026-08-21'), day('2026-02-01'));

  it('orders state notes by when they were last revised', () => {
    expect(listByLayer(client, 'state').map((n) => n.id)).toEqual([1, 2]);
  });

  it('reports a state note\'s date as its revision date', () => {
    expect(listByLayer(client, 'state')[0].at).toBe(day('2026-08-20'));
  });

  it('orders past notes by when they happened, not by a later edit', () => {
    expect(listByLayer(client, 'past').map((n) => n.id)).toEqual([3, 4]);
  });
});
