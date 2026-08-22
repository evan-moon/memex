import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Buried, TodayItem } from './api.ts';
import { dictionaries, type Locale, setLocale } from './i18n.ts';
import { TodayCard } from './Today.tsx';

const buried: Buried = {
  undeclared: 49,
  staleNotes: 61,
  forwardLinks: 105,
  placeholders: 21,
  tagMerges: 10,
  looseTags: 421,
};

const items: TodayItem[] = [
  { kind: 'evidence-moved', id: 3, title: '인식론 엔진' },
  { kind: 'typo-link', id: 1309, title: '스톡옵션', target: '0 강의소개', nearest: '0. 강의소개' },
  { kind: 'undeclared', id: 1767, title: '런치 킷', candidates: 4 },
];

const render = (data: { items: TodayItem[]; buried: Buried }, locale: Locale = 'en') => {
  setLocale(locale);
  return renderToStaticMarkup(
    <MemoryRouter>
      <TodayCard data={data} />
    </MemoryRouter>,
  );
};

describe('the home screen', () => {
  it('leads with how much today holds, not how much exists', () => {
    const t = dictionaries.en;
    const html = render({ items, buried });

    expect(html).toContain(t.today.title(3));
    for (const total of ['49', '61', '105', '421']) expect(html).not.toContain(`>${total}<`);
  });

  it('sends each kind of work to the place it can be done', () => {
    const html = render({ items, buried });

    expect(html).toContain('href="/inference/3"');
    expect(html).toContain('href="/note/1309"');
    expect(html).toContain('href="/note/1767"');
  });

  it('does not let a long hint squeeze the label out of its own row', () => {
    const long = '은퇴지출 확정(월 450만) → 진짜 FIRE ≈15억, 2031~33년(40~42세) 90%+ 도달';
    const html = render({
      items: [{ kind: 'typo-link', id: 1, title: 'a plan', target: long, nearest: `${long}.` }],
      buried,
    });

    // The label has to keep its line, and the two long strings have to be the
    // ones that give way -- reversed, the label wraps one character per line.
    expect(html).toContain('shrink-0 whitespace-nowrap text-sm');
    const hint = html.slice(html.indexOf(long) - 200, html.indexOf(long));
    expect(hint).toContain('truncate');
    expect(hint).not.toContain('shrink-0');
  });

  it('keeps what is waiting behind a click rather than on the page', () => {
    const t = dictionaries.en;
    const html = render({ items, buried });

    expect(html).toContain(t.today.buried);
    expect(html).not.toContain(t.today.buriedStale(61));
  });

  it('says the day is done rather than showing an empty list', () => {
    const t = dictionaries.en;
    const html = render({ items: [], buried });

    expect(html).toContain(t.today.empty);
    expect(html).not.toContain(t.today.start);
  });

  it('keeps the two locales apart', () => {
    // Titles are the vault's own words, so the fixture stays ASCII to leave
    // only the screen's copy under test.
    const ascii: TodayItem[] = [{ kind: 'undeclared', id: 1, title: 'a plan', candidates: 2 }];

    expect(render({ items: ascii, buried }, 'en')).not.toMatch(/[가-힣]/);
    expect(render({ items: ascii, buried }, 'ko')).toMatch(/[가-힣]/);
  });
});
