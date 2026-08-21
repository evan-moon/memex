import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MergeCandidate } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { TagMergeRow } from './TagMerges.tsx';

const t = dictionaries.en;

const render = (candidate: MergeCandidate) => {
  setLocale('en');
  return renderToStaticMarkup(<TagMergeRow candidate={candidate} onMerged={() => undefined} />);
};

describe('TagMergeRow', () => {
  it('shows which name survives and how much it will rewrite', () => {
    const html = render({ kind: 'spelling', keep: 'coffee-chat', drop: ['coffee_chat'], notes: 4 });
    expect(html).toContain('coffee_chat');
    expect(html).toContain('coffee-chat');
    expect(html).toContain(t.tags.affects(4));
    expect(html).toContain(t.tags.merge);
  });

  it('reports how much an uncertain pair actually shares', () => {
    const html = render({
      kind: 'overlap',
      keep: 'interview',
      drop: ['면접'],
      notes: 57,
      overlap: 0.98,
    });
    expect(html).toContain(t.tags.overlapping(98, 57));
  });

  it('offers to keep the other name when there is only one to fold in', () => {
    const one = render({ kind: 'overlap', keep: 'a', drop: ['b'], notes: 3, overlap: 1 });
    const many = render({ kind: 'spelling', keep: 'a', drop: ['b', 'c'], notes: 3 });
    expect(one).toContain(t.tags.swap);
    expect(many).not.toContain(t.tags.swap);
  });
});
