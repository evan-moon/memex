import { describe, expect, it } from 'vitest';
import { collapseSeries, isSameSeries, seriesKey } from './series.ts';

describe('seriesKey', () => {
  it('groups a dated work log under one key', () => {
    expect(seriesKey('opula 세션 인계 2026-07-20 — 긱뉴스 스파이크')).toBe(
      seriesKey('opula 세션 인계 2026-08-13 — egress 잔여 해소'),
    );
  });

  it('groups a parenthesised date range with a plain date', () => {
    expect(seriesKey('Firma 작업 세션 (2026-05-03)')).toBe(
      seriesKey('Firma 작업 세션 (2026-05-16~17)'),
    );
  });

  it('keeps unrelated notes apart', () => {
    expect(seriesKey('Firma 작업 세션 (2026-05-03)')).not.toBe(seriesKey('Opula 코드 정리'));
  });

  it('separates a short, easily-collided title by folder', () => {
    expect(seriesKey('회고', 'work')).not.toBe(seriesKey('회고', 'personal'));
  });

  it('keeps a distinctive series together even when one entry lost its folder', () => {
    expect(seriesKey('opula 세션 인계 2026-07-20 — 긱뉴스', 'projects')).toBe(
      seriesKey('opula 세션 인계 2026-08-03 — 채팅 첫 화면', null),
    );
  });

  it('treats an amendment as part of what it amends', () => {
    expect(seriesKey('[Amendment 2] Opula 인스타 편집방침')).toBe(
      seriesKey('Opula 인스타 편집방침'),
    );
  });

  it('does not collapse two people with similarly shaped titles', () => {
    expect(isSameSeries({ title: '남현님과 커피챗' }, { title: '창회님과 커피챗' })).toBe(false);
  });

  it('does collapse repeated notes about the same person', () => {
    expect(
      isSameSeries({ title: '남현님과 커피챗' }, { title: '남현님과 커피챗 (2026-05-02)' }),
    ).toBe(true);
  });
});

describe('collapseSeries', () => {
  const dated = (n: number) => ({ title: `opula 세션 인계 2026-07-${String(n).padStart(2, '0')}` });

  it('caps one series at two slots and fills the rest with other notes', () => {
    const candidates = [
      dated(1),
      dated(2),
      dated(3),
      dated(4),
      { title: 'something else' },
      { title: 'another thing' },
    ];
    const { results } = collapseSeries(candidates, 4);
    expect(results.map((r) => r.title)).toEqual([
      'opula 세션 인계 2026-07-01',
      'opula 세션 인계 2026-07-02',
      'something else',
      'another thing',
    ]);
  });

  it('reports only what did not fit on the page', () => {
    const { collapsed } = collapseSeries([dated(1), dated(2), dated(3), dated(4)], 2);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].hidden).toBe(2);
    expect(collapsed[0].label).toBe('opula 세션 인계');
  });

  it('fills the page from the deferred members rather than returning fewer', () => {
    const { results, collapsed } = collapseSeries([dated(1), dated(2), dated(3), dated(4)], 4);
    expect(results).toHaveLength(4);
    expect(collapsed).toEqual([]);
  });

  it('leaves a page with no series untouched', () => {
    const candidates = [{ title: 'a' }, { title: 'b' }, { title: 'c' }];
    const { results, collapsed } = collapseSeries(candidates, 3);
    expect(results).toHaveLength(3);
    expect(collapsed).toEqual([]);
  });

  it('never returns more than the limit', () => {
    expect(
      collapseSeries([{ title: 'a' }, { title: 'b' }, { title: 'c' }], 2).results,
    ).toHaveLength(2);
  });

  it('keeps the highest-ranked member of a series first', () => {
    const { results } = collapseSeries([dated(9), dated(1), dated(5)], 5);
    expect(results[0].title).toBe('opula 세션 인계 2026-07-09');
  });
});
