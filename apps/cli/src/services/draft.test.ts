import { describe, expect, it } from 'vitest';
import { normalizeDraft } from './draft.ts';

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
