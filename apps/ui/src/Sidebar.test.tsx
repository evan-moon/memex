import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { setLocale } from './i18n.ts';
import { Sidebar } from './Sidebar.tsx';

describe('Sidebar', () => {
  it('opens the daily note from the primary navigation', () => {
    setLocale('en');
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar
          data={{ counts: {}, stale: [], state: [], rule: [], rulesWaiting: 0 }}
          tree={null}
          onHistory={() => undefined}
          onChat={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('href="/daily"');
    expect(html).toContain('Daily note');
    expect(html).toContain('New document');
  });
});
