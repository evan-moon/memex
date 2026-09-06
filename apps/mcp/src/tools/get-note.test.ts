import { describe, expect, it } from 'vitest';
import { amendmentSections, claimStandingSection } from './get-note.ts';

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

describe('claimStandingSection', () => {
  const claim = (over: Partial<import('@memex/db').Claim>): import('@memex/db').Claim => ({
    id: 1,
    noteId: 9,
    idx: 0,
    text: '트라이얼은 14일이다',
    sourceHash: '',
    validFrom: Date.UTC(2026, 7, 3),
    validUntil: null,
    confirmedAt: null,
    confirmDepth: null,
    supersededBy: null,
    status: 'unconfirmed',
    kind: 'fact',
    ...over,
  });

  it('says nothing for a note with no claims', () => {
    expect(claimStandingSection(undefined)).toBe('');
    expect(claimStandingSection({ confirmed: [], unconfirmed: [], closed: [] })).toBe('');
  });

  it('dates a confirmation, so the reader knows how fresh it is', () => {
    const out = claimStandingSection({
      confirmed: [claim({ status: 'confirmed', confirmedAt: Date.UTC(2026, 8, 6) })],
      unconfirmed: [],
      closed: [],
    });
    expect(out).toContain('✓ confirmed 2026-09-06: 트라이얼은 14일이다');
  });

  it('dates an unchecked claim from when it was true, so the reader can discount it', () => {
    const out = claimStandingSection({ confirmed: [], unconfirmed: [claim({})], closed: [] });
    expect(out).toContain('○ unchecked, as of 2026-08-03');
  });

  it('keeps a closed claim visible but marked, rather than hiding it', () => {
    const out = claimStandingSection({
      confirmed: [],
      unconfirmed: [],
      closed: [claim({ status: 'closed', validUntil: Date.UTC(2026, 8, 1) })],
    });
    expect(out).toContain('✕ no longer true since 2026-09-01');
    expect(out).toContain('do not repeat ✕ as current');
  });
});
