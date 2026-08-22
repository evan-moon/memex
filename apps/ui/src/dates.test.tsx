import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dates } from './bits.tsx';
import { setLocale } from './i18n.ts';

const render = (at: number, updatedAt: number) => {
  setLocale('en');
  return renderToStaticMarkup(<Dates at={at} updatedAt={updatedAt} />);
};

const day = (iso: string) => Date.parse(`${iso}T09:00:00Z`);

describe('Dates', () => {
  it('shows when a note was last edited, so a later source is not misjudged', () => {
    const html = render(day('2026-06-28'), day('2026-08-01'));
    expect(html).toContain('written 2026-06-28');
    expect(html).toContain('last edited 2026-08-01');
  });

  it('says nothing about editing when the note was never edited', () => {
    const html = render(day('2026-06-28'), day('2026-06-28'));
    expect(html).toContain('written 2026-06-28');
    expect(html).not.toContain('last edited');
  });

  it('drops the edit date rather than printing a dash for a missing one', () => {
    const html = render(day('2026-06-28'), 0);
    expect(html).toContain('written 2026-06-28');
    expect(html).not.toContain('last edited');
    expect(html).not.toContain('—');
  });
});
