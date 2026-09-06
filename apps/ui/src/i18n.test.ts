import { describe, expect, it } from 'vitest';
import { dictionaries, type Locale } from './i18n.ts';

const locales: Locale[] = ['en', 'ko'];

const shapeOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v)]))
    : typeof value;

describe('dictionaries', () => {
  it('gives every locale the same shape', () => {
    expect(shapeOf(dictionaries.ko)).toEqual(shapeOf(dictionaries.en));
  });

  it('leaves nothing untranslated', () => {
    const emptyStrings = (value: unknown, path: string): string[] => {
      if (typeof value === 'string') return value.trim().length === 0 ? [path] : [];
      if (typeof value !== 'object' || value === null) return [];
      return Object.entries(value).flatMap(([k, v]) => emptyStrings(v, `${path}.${k}`));
    };
    for (const locale of locales) {
      expect(emptyStrings(dictionaries[locale], locale)).toEqual([]);
    }
  });
});

describe('status', () => {
  it('names the note that superseded this one', () => {
    for (const locale of locales) {
      const text = dictionaries[locale].status({
        kind: 'amended',
        by: { id: 42, title: 'A newer take' },
      });
      expect(text).toContain('42');
      expect(text).toContain('A newer take');
    }
  });

  it('counts what piled up behind a state note', () => {
    for (const locale of locales) {
      expect(dictionaries[locale].status({ kind: 'piled-up', count: 6 })).toContain('6');
    }
  });
});

describe('error', () => {
  it('words a known code in the reader’s language', () => {
    expect(dictionaries.en.error({ code: 'draft-state-only' })).toMatch(/state note/);
    expect(dictionaries.ko.error({ code: 'draft-state-only' })).toContain('현재 믿음 노트');
  });

  it('falls back to the server detail when the code is unknown', () => {
    const detail = 'claude exited with 1';
    for (const locale of locales) {
      expect(dictionaries[locale].error({ code: 'draft-failed', detail })).toBe(detail);
    }
  });

  it('still says something when there is neither a known code nor a detail', () => {
    for (const locale of locales) {
      expect(dictionaries[locale].error({ code: 'weird' }).length).toBeGreaterThan(0);
    }
  });
});
