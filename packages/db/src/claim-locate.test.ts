import { describe, expect, it } from 'vitest';
import { claimScope, locateClaims } from './claim-locate.ts';

const NOTE = `---
title: 캐러셀 설계
---

# 캐러셀 설계

## 이것이 바꾼 것

- 캐러셀은 4장으로 간다
- 리서치는 8~10장이 최적이라고 말한다

## 무슨 일이 있었나

본문이 이어진다.`;

describe('locateClaims', () => {
  it('finds a claim written as its own line in the note', () => {
    expect(locateClaims(['캐러셀은 4장으로 간다'], NOTE)).toEqual([
      { text: '캐러셀은 4장으로 간다', where: 'elsewhere' },
    ]);
  });

  it('ignores the list marker the claim was written under', () => {
    expect(locateClaims(['- 캐러셀은 4장으로 간다'], NOTE)[0].where).toBe('elsewhere');
  });

  it('ignores emphasis and collapses whitespace', () => {
    const note = '본문\n\n- **스프레드**는   인자를\n  건드리지 않는다';
    expect(locateClaims(['스프레드는 인자를 건드리지 않는다'], note)[0].where).toBe('elsewhere');
  });

  it('says a claim it cannot find is unlocated rather than guessing', () => {
    expect(locateClaims(['릴스는 9장으로 간다'], NOTE)[0].where).toBe('unlocated');
  });

  it('reports a claim that sits in the passage that matched', () => {
    const passage = '이것이 바꾼 것 캐러셀은 4장으로 간다';
    expect(locateClaims(['캐러셀은 4장으로 간다'], NOTE, passage)[0].where).toBe('passage');
  });

  it('does not read absence from a passage as proof, only presence', () => {
    const elided = '캐러셀 설계 … 본문이 이어진다';
    expect(locateClaims(['캐러셀은 4장으로 간다'], NOTE, elided)[0].where).toBe('elsewhere');
  });

  it('treats an empty claim as unlocated instead of matching everything', () => {
    expect(locateClaims(['   '], NOTE)[0].where).toBe('unlocated');
  });
});

describe('claimScope', () => {
  it('says whole when a correction named nothing', () => {
    expect(claimScope([])).toBe('whole');
  });

  it('says passage when a retired claim is in what matched', () => {
    expect(
      claimScope([
        { text: 'a', where: 'passage' },
        { text: 'b', where: 'elsewhere' },
      ]),
    ).toBe('passage');
  });

  it('says partial when every named claim was found elsewhere in the note', () => {
    expect(
      claimScope([
        { text: 'a', where: 'elsewhere' },
        { text: 'b', where: 'elsewhere' },
      ]),
    ).toBe('partial');
  });

  it('falls back to whole when one named claim is nowhere in the note', () => {
    expect(
      claimScope([
        { text: 'a', where: 'elsewhere' },
        { text: 'b', where: 'unlocated' },
      ]),
    ).toBe('whole');
  });
});
