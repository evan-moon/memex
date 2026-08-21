import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Digest } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { ThisWeekBlocks } from './ThisWeek.tsx';

const t = dictionaries.en;
const now = Date.now();

const digest = (over: Partial<Digest> = {}): Digest => ({
  days: 7,
  since: now - 7 * 86_400_000,
  total: 0,
  folders: [],
  signals: [],
  attention: [],
  inferences: { active: [], stale: [] },
  connection: null,
  ...over,
});

const render = (over: Partial<Digest> = {}) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter>
      <ThisWeekBlocks digest={digest(over)} />
    </MemoryRouter>,
  );
};

describe('ThisWeekBlocks', () => {
  it('says a quiet week is quiet instead of showing an empty frame', () => {
    const html = render();
    expect(html).toContain(t.thisWeek.arrivedNone);
    expect(html).toContain(t.thisWeek.connectionNone);
  });

  it('lists what came in, newest first', () => {
    const html = render({
      total: 2,
      folders: [
        {
          folder: 'projects',
          notes: [
            { id: 1, title: 'older note', layer: 'past', at: now - 2000, tags: [] },
            { id: 2, title: 'newer note', layer: 'past', at: now, tags: [] },
          ],
        },
      ],
    });
    expect(html).toContain(t.thisWeek.spread(2, 1));
    expect(html.indexOf('newer note')).toBeLessThan(html.indexOf('older note'));
    expect(html).toContain('/note/2');
  });

  it('shows both ends of a connection and the gap between them', () => {
    const html = render({
      connection: {
        from: { id: 3, title: 'yesterday', layer: 'past', at: now, tags: [] },
        to: { id: 4, title: 'a year ago', layer: 'past', at: now - 4000, tags: [] },
        daysApart: 124,
      },
    });
    expect(html).toContain('yesterday');
    expect(html).toContain('a year ago');
    expect(html).toContain(t.thisWeek.apart(124));
  });
});
