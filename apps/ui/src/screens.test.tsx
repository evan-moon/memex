import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Topic } from './api.ts';
import { dictionaries, type Locale, setLocale } from './i18n.ts';
import { TopicsScreen } from './screens.tsx';

const topic: Topic = {
  tag: 'memex',
  count: 12,
  spark: [0, 1, 3, 0],
  lastAt: Date.now() - 86_400_000,
  dormant: false,
  currentCount: 8,
  changedCount: 3,
  reviewCount: 1,
  current: [{ id: 1, title: 'still true', layer: 'state', at: Date.now(), status: null }],
  outdated: [
    {
      id: 2,
      title: 'was true',
      layer: 'state',
      at: Date.now(),
      status: { kind: 'amended', by: { id: 3, title: 'the correction' } },
    },
  ],
  companions: [{ tag: 'mcp', shared: 6, overlap: 0.9, sameThing: false }],
  arcs: [{ reasoning: null, noteIds: [1, 2] }],
};

const render = (locale: Locale) => {
  setLocale(locale);
  return renderToStaticMarkup(
    <MemoryRouter>
      <TopicsScreen topics={[topic]} />
    </MemoryRouter>,
  );
};

describe('TopicsScreen', () => {
  it.each<Locale>(['en', 'ko'])('renders a topic through the %s dictionary', (locale) => {
    const html = render(locale);
    const t = dictionaries[locale];
    expect(html).toContain('memex');
    expect(html).toContain(t.topics.title);
    expect(html).toContain(t.topics.stillHolds);
    expect(html).toContain(t.spark.title);
    expect(html).toContain(t.common.notes(topic.count));
  });

  it('keeps the two locales apart', () => {
    expect(render('en')).not.toMatch(/[가-힣]/);
    expect(render('ko')).toMatch(/[가-힣]/);
  });
});
