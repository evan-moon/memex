import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { dictionaries, setLocale } from './i18n.ts';
import { SearchScreen } from './screens.tsx';

const t = dictionaries.en;

const render = (url: string) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/search" element={<SearchScreen />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('SearchScreen', () => {
  it('offers every filter before any result has arrived', () => {
    const html = render('/search?q=auth');
    expect(html).toContain(t.search.anyLayer);
    expect(html).toContain(t.search.anyFolder);
    expect(html).toContain(t.search.anyTag);
    expect(html).toContain(t.search.from);
    expect(html).toContain(t.search.to);
  });

  it('takes its state from the url, so a filtered search survives a reload', () => {
    const html = render('/search?q=auth&layer=state&from=2026-01-01');
    expect(html).toMatch(/<option value="state"[^>]*selected/);
    expect(html).toContain('value="2026-01-01"');
  });

  it('offers to clear only once something is filtering', () => {
    expect(render('/search?q=auth')).not.toContain(t.search.clear);
    expect(render('/search?q=auth&tag=memex')).toContain(t.search.clear);
  });
});

describe('the authorship filter', () => {
  it('offers to look at one memory or the other', () => {
    const html = render('/search?q=auth');
    expect(html).toContain(t.search.anyAuthor);
    expect(html).toContain(t.search.mine);
    expect(html).toContain(t.search.agents);
  });

  it('remembers which one is chosen, and counts as a filter', () => {
    const html = render('/search?q=auth&author=agent');
    expect(html).toMatch(/<option value="agent"[^>]*selected/);
    expect(html).toContain(t.search.clear);
  });
});
