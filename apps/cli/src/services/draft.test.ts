import { describe, expect, it } from 'vitest';
import { normalizeDraft, parseDraft } from './draft.ts';

describe('normalizeDraft', () => {
  it('unwraps a fenced answer', () => {
    expect(normalizeDraft('```markdown\n본문.\n```', '본문.')).toBe('본문.');
  });

  it('drops a heading the model added to a body that had none', () => {
    expect(normalizeDraft('# 제목\n\n새 본문.', '옛 본문.')).toBe('새 본문.');
  });

  it('keeps the heading when the body it rewrote started with one', () => {
    expect(normalizeDraft('# 새 제목\n\n새 본문.', '# 옛 제목\n\n옛 본문.')).toBe(
      '# 새 제목\n\n새 본문.',
    );
  });

  it('leaves a mid-body heading alone', () => {
    expect(normalizeDraft('본문.\n\n## 소제목\n', '본문.')).toBe('본문.\n\n## 소제목');
  });
});

describe('parseDraft', () => {
  const raw = [
    '새 본문이다.',
    '',
    '<<<CHANGES>>>',
    '- [#2196] 이슈 4·5가 추가로 발견돼 완료 목록을 고쳤어',
    '- [#2195] 0부 신설이 반영 안 돼 있었어',
    '',
  ].join('\n');

  it('splits the body from the rationale', () => {
    expect(parseDraft(raw, '옛 본문.').body).toBe('새 본문이다.');
  });

  it('reads each change as text plus the note it came from', () => {
    expect(parseDraft(raw, '옛 본문.').changes).toEqual([
      { from: [2196], text: '이슈 4·5가 추가로 발견돼 완료 목록을 고쳤어' },
      { from: [2195], text: '0부 신설이 반영 안 돼 있었어' },
    ]);
  });

  it('keeps several ids on one line', () => {
    const out = parseDraft('본문\n<<<CHANGES>>>\n- [#1, #2] 둘 다 반영', '옛');
    expect(out.changes[0].from).toEqual([1, 2]);
    expect(out.changes[0].text).toBe('둘 다 반영');
  });

  it('treats a draft with no rationale as a body with no changes listed', () => {
    expect(parseDraft('본문뿐', '옛').body).toBe('본문뿐');
    expect(parseDraft('본문뿐', '옛').changes).toEqual([]);
  });

  it('reports "nothing to change" as a verdict, not as a missing explanation', () => {
    const out = parseDraft('본문\n<<<CHANGES>>>\n- 바꿀 것 없음', '옛');
    expect(out.changes).toEqual([]);
    expect(out.verdict).toBe('no-change');
  });

  it('keeps the reasoning when nothing changed and ids were cited anyway', () => {
    const out = parseDraft(
      '본문\n<<<CHANGES>>>\n- [#2170, #2176] 바꿀 것 없음 (둘 다 이 노트가 다루는 주제와 별개다)',
      '옛',
    );
    expect(out.verdict).toBe('no-change');
    expect(out.changes).toEqual([]);
    expect(out.reason).toBe('둘 다 이 노트가 다루는 주제와 별개다');
  });

  it('reports a reply with no rationale section as unexplained', () => {
    expect(parseDraft('본문뿐', '옛').verdict).toBe('unexplained');
  });

  it('reports a listed rationale as changed', () => {
    expect(parseDraft(raw, '옛 본문.').verdict).toBe('changed');
  });

  it('still strips a heading the model added ahead of the split', () => {
    expect(parseDraft('# 제목\n\n본문.\n<<<CHANGES>>>\n- [#1] 어쩌고', '옛 본문').body).toBe(
      '본문.',
    );
  });
});
