import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Overview as OverviewData, Topic } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { Overview } from './Overview.tsx';

const emptyVault: OverviewData = {
  notes: 0,
  chunks: 0,
  links: { wiki: 0, amends: 0 },
  topics: 0,
  changed: 0,
  review: 0,
  activity: [{ date: '2026-08-29', notes: 0 }],
  staleness: [],
};

const topics: Topic[] = [];

const render = (data: OverviewData) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter>
      <Overview data={data} topics={topics} />
    </MemoryRouter>,
  );
};

describe('an empty vault', () => {
  it('says nothing has started, instead of assembling a dashboard of zeroes', () => {
    const t = dictionaries.en;
    const html = render(emptyVault);

    expect(html).toContain(t.overview.emptyTitle);
    expect(html).toContain('/settings');
    // The daily card is what says "All done.", and it only says it because the
    // rest of the screen renders around it. Nothing here has started, so none
    // of that scaffolding is built.
    expect(html).not.toContain(t.overview.arrived);
    expect(html).not.toContain(t.overview.topics);
  });

  it('still builds the whole screen once something has been written', () => {
    const t = dictionaries.en;
    const html = render({ ...emptyVault, notes: 1 });

    expect(html).toContain(t.overview.arrived);
    expect(html).not.toContain(t.overview.emptyTitle);
  });
});
