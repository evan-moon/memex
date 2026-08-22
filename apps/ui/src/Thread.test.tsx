import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Thread, ThreadStep } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { straighten } from './thread-layout.ts';
import { ThreadRow, ThreadTimeline } from './Thread.tsx';

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

describe('a thread in the list', () => {
  const thread = (over: Partial<Thread> = {}): Thread => ({
    rootId: 2094,
    title: 'Obsidian 정합성 재편',
    root: step(2094, 1, [step(2095, 2)]),
    startedAt: Date.parse('2026-08-02T00:00:00Z'),
    lastAt: Date.parse('2026-08-22T00:00:00Z'),
    steps: 2,
    branches: 1,
    tags: ['memex', 'obsidian', 'vault', 'frontmatter'],
    ...over,
  });

  const row = (over: Partial<Thread> = {}) => {
    setLocale('en');
    return renderToStaticMarkup(
      <MemoryRouter>
        <ThreadRow thread={thread(over)} />
      </MemoryRouter>,
    );
  };

  it('leads with how far the line went and where it split', () => {
    const html = row();

    expect(html).toContain(t.threads.steps(2));
    expect(html).toContain(t.threads.branches(1));
  });

  it('does not spend the row on tags, which say least about a thread', () => {
    const html = row();

    for (const tag of ['memex', 'obsidian', 'vault', 'frontmatter']) {
      expect(html).not.toContain(`>${tag}<`);
    }
    expect(html).not.toContain('/topic/');
  });

  it('says nothing about branching when the line never split', () => {
    expect(row({ branches: 0 })).not.toContain(t.threads.branches(0));
  });
});
