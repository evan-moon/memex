import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { dictionaries, type Locale, setLocale } from './i18n.ts';
import { NotFoundScreen } from './screens.tsx';

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
