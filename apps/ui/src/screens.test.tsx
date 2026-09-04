import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AmendedRef, AmendKind } from './api.ts';
import { dictionaries, type Locale, setLocale } from './i18n.ts';
import { AmendedNotice, NotFoundScreen } from './screens.tsx';

const render = (locale: Locale) => {
  setLocale(locale);
  return renderToStaticMarkup(
    <MemoryRouter>
      <NotFoundScreen />
    </MemoryRouter>,
  );
};

describe('NotFoundScreen', () => {
  it.each<Locale>(['en', 'ko'])('says the address points nowhere in %s', (locale) => {
    const html = render(locale);
    const t = dictionaries[locale];
    expect(html).toContain(t.notFound.title);
    expect(html).toContain(t.notFound.lead);
    expect(html).toContain('href="/"');
  });

  it('keeps the two locales apart', () => {
    expect(render('en')).not.toMatch(/[가-힣]/);
    expect(render('ko')).toMatch(/[가-힣]/);
  });
});

const amendment = (over: Partial<AmendedRef> = {}): AmendedRef => ({
  id: 9,
  title: '[Amendment] 시장 기여 연환산은 21.1%',
  layer: 'past',
  author: 'person',
  at: Date.now(),
  kind: 'corrects',
  ...over,
});

const notice = (locale: Locale, refs: AmendedRef[], kind: AmendKind = 'corrects') => {
  setLocale(locale);
  return renderToStaticMarkup(
    <MemoryRouter>
      <AmendedNotice refs={refs} kind={kind} />
    </MemoryRouter>,
  );
};

describe('AmendedNotice', () => {
  it('says nothing when a note was never amended', () => {
    expect(notice('en', [])).toBe('');
  });

  it.each<Locale>(['en', 'ko'])('names the retired sentences in %s', (locale) => {
    const html = notice(locale, [
      amendment({ invalidates: ['13.2%는 내 쿼리의 창 오류'], scope: 'partial' }),
    ]);
    expect(html).toContain(dictionaries[locale].note.retired);
    expect(html).toContain('13.2%는 내 쿼리의 창 오류');
  });

  it.each<Locale>(['en', 'ko'])('says the rest of the note stands in %s', (locale) => {
    const html = notice(locale, [
      amendment({ invalidates: ['13.2%는 내 쿼리의 창 오류'], scope: 'partial' }),
    ]);
    expect(html).toContain(dictionaries[locale].note.restStands);
    expect(html).toContain(dictionaries[locale].note.partlyCorrected(1));
  });

  it('does not promise the rest stands when a claim was not found in the note', () => {
    const t = dictionaries.en;
    const html = notice('en', [amendment({ invalidates: ['a claim'], scope: 'whole' })]);
    expect(html).not.toContain(t.note.restStands);
    expect(html).toContain(t.note.correctedBy(1));
  });

  it('does not promise the rest stands when the correction named nothing', () => {
    const t = dictionaries.en;
    const html = notice('en', [amendment()]);
    expect(html).not.toContain(t.note.restStands);
    expect(html).toContain(t.note.correctedBy(1));
  });

  it('does not draw a box around a correction', () => {
    const html = notice('en', [amendment({ invalidates: ['a claim'], scope: 'partial' })]);
    expect(html).toContain('border-l-2');
    expect(html).not.toContain('glass');
    expect(html).not.toContain('rounded-card');
  });

  it('keeps a continuation quiet rather than warning about it', () => {
    const t = dictionaries.en;
    const html = notice('en', [amendment({ kind: 'continues' })], 'continues');
    expect(html).toContain(t.note.continuedBy(1));
    expect(html).not.toContain(t.note.correctedBy(1));
  });
});
