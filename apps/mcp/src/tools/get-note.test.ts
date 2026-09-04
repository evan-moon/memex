import { describe, expect, it } from 'vitest';
import { amendmentSections } from './get-note.ts';

const NOTE =
  '# 캐러셀 설계\n\n## 이것이 바꾼 것\n\n- 캐러셀은 4장으로 간다\n\n## 무슨 일이 있었나\n\n리서치는 8~10장이 최적이라고 말한다.';

describe('amendmentSections', () => {
  it('says nothing when a note was never amended', () => {
    expect(amendmentSections([], NOTE)).toBe('');
  });

  it('names each retired claim under the correction that retired it', () => {
    const out = amendmentSections(
      [{ id: 7, title: 'fix', kind: 'corrects', invalidates: ['캐러셀은 4장으로 간다'] }],
      NOTE,
    );
    expect(out).toContain('#7 [[fix]]');
    expect(out).toContain('no longer true: 캐러셀은 4장으로 간다');
  });

  it('says the rest stands once every retired claim is accounted for', () => {
    const out = amendmentSections(
      [{ id: 7, title: 'fix', kind: 'corrects', invalidates: ['캐러셀은 4장으로 간다'] }],
      NOTE,
    );
    expect(out).toContain('The rest of this note still stands');
  });

  it('flags a retired claim that is nowhere in the note it retires', () => {
    const out = amendmentSections(
      [{ id: 7, title: 'fix', kind: 'corrects', invalidates: ['릴스는 9장으로 간다'] }],
      NOTE,
    );
    expect(out).toContain('not in the note above');
    expect(out).not.toContain('The rest of this note still stands');
  });

  it('does not promise the rest stands when a correction named nothing', () => {
    const out = amendmentSections([{ id: 7, title: 'fix', kind: 'corrects' }], NOTE);
    expect(out).toContain('#7 [[fix]]');
    expect(out).not.toContain('The rest of this note still stands');
  });

  it('does not put a retirement notice under a continuation', () => {
    const out = amendmentSections([{ id: 8, title: 'more', kind: 'continues' }], NOTE);
    expect(out).toContain('still holds');
    expect(out).not.toContain('The rest of this note still stands');
  });
});
