import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { NoteDetail } from './api.ts';
import { Evidence } from './Evidence.tsx';
import { dictionaries, setLocale } from './i18n.ts';

const t = dictionaries.en;

const note = (over: Partial<NoteDetail> = {}): NoteDetail => ({
  id: 7,
  title: 'a plan',
  content: 'body',
  layer: 'state',
  author: 'person',
  at: Date.now(),
  updatedAt: Date.now(),
  tags: [],
  filePath: '/vault/note.md',
  writable: true,
  folder: null,
  amendment: null,
  wikiLinks: [],
  deadLinks: [],
  evidence: [],
  candidateSources: [],
  hypotheses: [],
  stale: null,
  supersededBy: [],
  corrects: [],
  backlinks: [],
  related: [],
  ...over,
});

const render = (over: Partial<NoteDetail> = {}) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter>
      <Evidence note={note(over)} onSaved={() => undefined} />
    </MemoryRouter>,
  );
};

const source = (over = {}) => ({
  id: 1,
  title: 'what happened',
  changed: false,
  missing: false,
  amendedBy: null,
  ...over,
});

describe('Evidence', () => {
  it('says nothing about a note that is not a projection', () => {
    expect(render({ layer: 'past' })).toBe('');
  });

  it('asks an undeclared projection to say what it stands on', () => {
    const html = render({ candidateSources: [] });
    expect(html).toContain(t.evidence.undeclared);
    expect(html).not.toContain(t.evidence.offer);
  });

  it('offers the notes it links to when it has some', () => {
    const html = render({
      candidateSources: [{ id: 3, title: 'what happened', layer: 'past', at: 1 }],
    });
    expect(html).toContain(t.evidence.offer);
    expect(html).toContain('what happened');
    expect(html).toContain(t.evidence.declare);
  });

  it('reports a projection whose sources all still read the same as holding', () => {
    const html = render({ evidence: [source()] });
    expect(html).toContain(t.evidence.holds);
    expect(html).not.toContain(t.evidence.accounted);
  });

  it('names the correction that undermined a source', () => {
    const html = render({
      evidence: [source({ amendedBy: { id: 9, title: '[Amendment] what happened' } })],
    });
    expect(html).toContain(t.evidence.amended('[Amendment] what happened'));
    expect(html).toContain(t.evidence.accounted);
    expect(html).not.toContain(t.evidence.holds);
  });

  it('separates a source that was rewritten from one that vanished', () => {
    expect(render({ evidence: [source({ changed: true })] })).toContain(t.evidence.changed);
    expect(render({ evidence: [source({ missing: true })] })).toContain(t.evidence.missing);
  });
});
