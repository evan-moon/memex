import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ThreadStep } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { straighten } from './thread-layout.ts';
import { ThreadTimeline } from './Thread.tsx';

const t = dictionaries.en;

const step = (id: number, at: number, children: ThreadStep[] = []): ThreadStep => ({
  id,
  title: `step ${id}`,
  layer: 'past',
  at,
  children,
});

const render = (root: ThreadStep) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter>
      <ThreadTimeline line={straighten(root)} />
    </MemoryRouter>,
  );
};

describe('a thread on screen', () => {
  it('names every step by id, so a note can be spoken about', () => {
    const html = render(step(1, 1, [step(2, 2)]));

    expect(html).toContain('#1');
    expect(html).toContain('#2');
  });

  it('says where the line stands now only at the end of the line', () => {
    const html = render(step(1, 1, [step(2, 2)]));

    expect(html.split(t.threads.latest)).toHaveLength(2);
  });

  it('introduces a branch by what happened, not by what it is drawn as', () => {
    const html = render(step(1, 1, [step(2, 2), step(3, 3, [step(4, 9)])]));

    expect(html).toContain(t.threads.alsoWent);
    expect(html).toContain(t.threads.steps(1));
  });

  it('marks where the line stands even when something branched off it', () => {
    const html = render(step(1, 1, [step(2, 2), step(3, 3)]));

    expect(html.split(t.threads.latest)).toHaveLength(2);
  });

  it('marks the end of the line, not the end of a branch that stopped', () => {
    const html = render(step(1, 1, [step(2, 2), step(3, 3, [step(4, 9)])]));

    expect(html.split(t.threads.latest)).toHaveLength(2);
    expect(html.indexOf(t.threads.latest)).toBeGreaterThan(html.indexOf('#4'));
  });
});
