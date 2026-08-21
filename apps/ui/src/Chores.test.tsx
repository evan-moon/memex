import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Chores } from './api.ts';
import { ChoresList } from './Chores.tsx';
import { dictionaries, setLocale } from './i18n.ts';

const t = dictionaries.en;

const chores = (over: Partial<Chores> = {}): Chores => ({
  hypotheses: { total: 0, top: [] },
  undeclared: { total: 0, top: [] },
  staleNotes: { total: 0, top: [] },
  deadLinks: { total: 0, notes: 0, top: [] },
  tagMerges: { total: 0, top: [] },
  looseTags: { total: 0, all: 0, top: [] },
  ...over,
});

const render = (over: Partial<Chores> = {}) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter>
      <ChoresList data={chores(over)} />
    </MemoryRouter>,
  );
};

describe('ChoresList', () => {
  it('says the vault is tidy rather than showing four zeroes', () => {
    const html = render();
    expect(html).toContain(t.chores.allClear);
    expect(html).not.toContain(t.chores.staleNotes);
  });

  it('shows the whole count, not just the few it can list', () => {
    const html = render({
      staleNotes: { total: 60, top: [{ id: 1, title: 'a plan', count: 4 }] },
    });
    expect(html).toContain('60');
    expect(html).toContain(t.chores.staleNotes);
  });

  it('leaves out a chore with nothing in it', () => {
    const html = render({ deadLinks: { total: 129, notes: 91, top: [] } });
    expect(html).toContain(t.chores.deadLinks);
    expect(html).toContain(t.chores.deadLinksHint(91));
    expect(html).not.toContain(t.chores.looseTags);
  });

  it('separates the tags it can fix from the ones it merely counted', () => {
    const html = render({ looseTags: { total: 422, all: 779, top: ['a', 'b'] } });
    expect(html).toContain('422');
    expect(html).toContain(t.chores.looseTagsHint(779));
  });
});
