import { describe, expect, it } from 'vitest';
import { titleScore } from './title-score.ts';

describe('titleScore', () => {
  it('puts a title that starts with what you typed first', () => {
    expect(titleScore('memex 기능 카탈로그', 'memex')).toBeGreaterThan(
      titleScore('Firma & Memex 인프라 개편', 'memex'),
    );
  });

  it('ranks a word boundary above a match buried inside a word', () => {
    expect(titleScore('opula show_product drag', 'product')).toBeGreaterThan(
      titleScore('reproduction notes', 'product'),
    );
  });

  it('scores nothing when the title does not contain it at all', () => {
    expect(titleScore('opula 대시보드', 'memex')).toBe(0);
  });

  it('ignores case, since nobody holds shift to find a note', () => {
    expect(titleScore('Memex 기능 카탈로그', 'memex')).toBe(3);
  });
});
