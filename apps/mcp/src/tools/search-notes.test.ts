import { describe, expect, it } from 'vitest';
import { formatSize, ownWorkHint, stamp, supersededLine, toSnippet } from './search-notes.ts';

describe('toSnippet', () => {
  it('strips leading frontmatter and collapses whitespace', () => {
    const content = '---\ntitle: 힙 정렬\ntags:\n  - heap\n---\n\n첫 문단이다.\n\n둘째   문단이다.';
    expect(toSnippet(content)).toBe('첫 문단이다. 둘째 문단이다.');
  });

  it('truncates long content with ellipsis', () => {
    const snippet = toSnippet('가'.repeat(500));
    expect(snippet).toHaveLength(301);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('returns short content without frontmatter unchanged', () => {
    expect(toSnippet('짧은 노트')).toBe('짧은 노트');
  });
});

describe('formatSize', () => {
  it('shows raw chars under 1k', () => {
    expect(formatSize(200)).toBe('200 chars');
  });

  it('shows k-suffixed size at 1k and above', () => {
    expect(formatSize(15300)).toBe('15.3k chars');
  });
});

describe('supersededLine', () => {
  it('says nothing when the note stands', () => {
    expect(supersededLine([])).toBe('');
  });

  it('names the one correction', () => {
    expect(supersededLine([{ id: 7, title: 'fix', kind: 'corrects' }])).toContain('#7 "fix"');
  });

  it('leads with the newest correction and counts the rest', () => {
    const line = supersededLine([
      { id: 7, title: 'first', kind: 'corrects' },
      { id: 8, title: 'second', kind: 'corrects' },
      { id: 9, title: 'third', kind: 'corrects' },
    ]);
    expect(line).toContain('#9 "third"');
    expect(line).toContain('2 earlier');
    expect(line).not.toContain('"first"');
  });

  it('does not call a continuation a correction', () => {
    const line = supersededLine([{ id: 8, title: 'more', kind: 'continues' }]);
    expect(line).toContain('continued by #8 "more"');
    expect(line).not.toContain('superseded');
    expect(line).not.toContain('corrected');
  });

  it('does not claim an untyped amendment says the note is wrong', () => {
    const line = supersededLine([{ id: 8, title: 'later', kind: 'unknown' }]);
    expect(line).toContain('#8 "later"');
    expect(line).toContain('did not say');
    expect(line).not.toContain('superseded');
  });

  const NOTE =
    '# 캐러셀 설계\n\n## 이것이 바꾼 것\n\n- 캐러셀은 4장으로 간다\n\n## 무슨 일이 있었나\n\n리서치는 8~10장이 최적이라고 말한다.';

  it('still condemns the whole note when the correction named nothing', () => {
    const line = supersededLine([{ id: 7, title: 'fix', kind: 'corrects' }], { content: NOTE });
    expect(line).toContain('superseded');
    expect(line).toContain('Read that before using this note');
    expect(line).not.toContain('still stands');
  });

  it('says the rest stands when every retired claim was found in the note', () => {
    const line = supersededLine(
      [{ id: 7, title: 'fix', kind: 'corrects', invalidates: ['캐러셀은 4장으로 간다'] }],
      { content: NOTE },
    );
    expect(line).toContain('partly superseded');
    expect(line).toContain('The rest of it still stands');
    expect(line).toContain('No longer true: "캐러셀은 4장으로 간다"');
  });

  it('condemns the passage itself when the retired claim is what matched', () => {
    const line = supersededLine(
      [{ id: 7, title: 'fix', kind: 'corrects', invalidates: ['캐러셀은 4장으로 간다'] }],
      { content: NOTE, passage: '이것이 바꾼 것 캐러셀은 4장으로 간다' },
    );
    expect(line).toContain('the passage below is retired');
    expect(line).not.toContain('still stands');
  });

  it('does not clear a note when a named claim is nowhere inside it', () => {
    const line = supersededLine(
      [{ id: 7, title: 'fix', kind: 'corrects', invalidates: ['릴스는 9장으로 간다'] }],
      { content: NOTE },
    );
    expect(line).toContain('superseded');
    expect(line).not.toContain('still stands');
  });

  it('keeps the old whole-note wording when no context is passed', () => {
    const line = supersededLine([
      { id: 7, title: 'fix', kind: 'corrects', invalidates: ['캐러셀은 4장으로 간다'] },
    ]);
    expect(line).toContain('Read that before using this note');
  });

  it('reports a correction and a continuation separately', () => {
    const line = supersededLine([
      { id: 7, title: 'wrong bit', kind: 'corrects' },
      { id: 8, title: 'more', kind: 'continues' },
    ]);
    expect(line).toContain('corrected by #7 "wrong bit"');
    expect(line).toContain('continued by #8 "more"');
  });

  it('leads with the correction even when a continuation is newer', () => {
    const line = supersededLine([
      { id: 7, title: 'wrong bit', kind: 'corrects' },
      { id: 9, title: 'more', kind: 'continues' },
    ]);
    expect(line.indexOf('corrected by')).toBeLessThan(line.indexOf('continued by'));
  });
});

describe('stamp', () => {
  it('says only the layer for a note the user wrote', () => {
    expect(stamp({ layer: 'state', author: 'person' })).toBe('state');
  });

  it('names the agent, so its own summary is not read as the user speaking', () => {
    expect(stamp({ layer: 'state', author: 'agent' })).toBe('state · agent');
  });

  it('assumes nothing when the author is unknown', () => {
    expect(stamp({ layer: 'past' })).toBe('past');
  });
});

describe('ownWorkHint', () => {
  it('says which note wins when the two disagree', () => {
    expect(ownWorkHint).toContain("user's note wins");
  });
});
