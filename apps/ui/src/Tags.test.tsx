import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TagRow } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { TagRowItem } from './Tags.tsx';

const t = dictionaries.en;

const render = (row: TagRow) => {
  setLocale('en');
  return renderToStaticMarkup(<TagRowItem row={row} onChanged={() => undefined} />);
};

describe('TagRowItem', () => {
  it('shows a plain count when the whole tag lives in the vault', () => {
    const html = render({ tag: 'memex', notes: 118, mine: 118 });
    expect(html).toContain('memex');
    expect(html).toContain('118');
    expect(html).not.toContain(t.tags.outside);
  });

  it('says how much of a split tag memex may touch', () => {
    const html = render({ tag: 'react', notes: 40, mine: 12 });
    expect(html).toContain(t.tags.partly(12, 40));
  });

  it('refuses to offer edits on a tag that only exists outside the vault', () => {
    const html = render({ tag: 'blog-only', notes: 9, mine: 0 });
    expect(html).toContain(t.tags.outside);
    expect(html).not.toContain(t.tags.remove);
    expect(html).toContain('disabled');
  });

  it('asks before taking a tag off notes', () => {
    const html = render({ tag: 'junk', notes: 3, mine: 3 });
    expect(html).not.toContain(t.tags.confirmRemove(3));
    expect(html).toContain(t.tags.remove);
  });
});
