import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '@memex/db';
import { afterAll, describe, expect, it } from 'vitest';
import { bodyOf, listByLayer, noteTitles, recompose, searchFacets } from './notes.ts';

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

describe('recompose', () => {
  const samples = [
    [
      '---',
      'title: 제목',
      'date: 2026-01-01',
      'categories: [a]',
      '---',
      '',
      '# 제목',
      '',
      '본문.',
      '',
    ].join('\n'),
    ['---', 'title: 제목', '---', '', '본문.', ''].join('\n'),
    '# 다른 제목\n\n본문.\n',
    '그냥 본문.\n',
  ];

  it('puts back exactly what bodyOf took off', () => {
    for (const original of samples) {
      expect(recompose(original, bodyOf(original, '제목'), '제목')).toBe(original);
    }
  });

  it('keeps frontmatter fields that only the file records', () => {
    const original = samples[0];
    const out = recompose(original, '새 본문.\n', '제목');
    expect(out).toContain('date: 2026-01-01');
    expect(out).toContain('categories: [a]');
    expect(out).toContain('# 제목');
    expect(out).toContain('새 본문.');
    expect(out).not.toContain('본문.\n---');
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
  insert.run(
    1,
    'old note, freshly revised',
    'state',
    '/a.md',
    day('2026-01-01'),
    day('2026-08-20'),
    day('2026-01-01'),
  );
  insert.run(
    2,
    'newer note, untouched since',
    'state',
    '/b.md',
    day('2026-06-01'),
    day('2026-06-01'),
    day('2026-06-01'),
  );
  insert.run(
    3,
    'happened later',
    'past',
    '/c.md',
    day('2026-01-01'),
    day('2026-08-20'),
    day('2026-07-01'),
  );
  insert.run(
    4,
    'happened first',
    'past',
    '/d.md',
    day('2026-01-01'),
    day('2026-08-21'),
    day('2026-02-01'),
  );

  it('orders state notes by when they were last revised', () => {
    expect(listByLayer(client, 'state').map((n) => n.id)).toEqual([1, 2]);
  });

  it("reports a state note's date as its revision date", () => {
    expect(listByLayer(client, 'state')[0].at).toBe(day('2026-08-20'));
  });

  it('orders past notes by when they happened, not by a later edit', () => {
    expect(listByLayer(client, 'past').map((n) => n.id)).toEqual([3, 4]);
  });
});

describe('noteTitles and searchFacets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-facets-'));
  const client = openDb(dir);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const day = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const insert = client.sqlite.prepare(
    `INSERT INTO notes (id, title, content, category, tags, layer, file_path,
                        created_at, updated_at, authored_at, source)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, 'manual')`,
  );

  insert.run(1, 'older', 'projects', '["memex","mcp"]', 'state', '/a.md', 1, 1, day('2026-01-01'));
  insert.run(2, 'newer', 'projects', '["memex"]', 'past', '/b.md', 2, 2, day('2026-06-01'));
  insert.run(3, 'loose', null, '["writing"]', 'past', '/c.md', 3, 3, day('2026-03-01'));

  it('hands the palette newest first, and nothing it will not use', () => {
    expect(noteTitles(client, 10)).toEqual([
      { id: 2, title: 'newer', layer: 'past' },
      { id: 3, title: 'loose', layer: 'past' },
      { id: 1, title: 'older', layer: 'state' },
    ]);
  });

  it('stops at the limit it was given', () => {
    expect(noteTitles(client, 1).map((n) => n.id)).toEqual([2]);
  });

  it('offers folders and tags by how much of the vault they cover', () => {
    const facets = searchFacets(client);
    expect(facets.folders).toEqual([{ name: 'projects', count: 2 }]);
    expect(facets.tags[0]).toEqual({ name: 'memex', count: 2 });
    expect(facets.tags.map((t) => t.name)).toContain('writing');
  });
});
