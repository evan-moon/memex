import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { NoteDetail } from './api.ts';
import { correctionDraft } from './drafts.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { Markdown } from './Markdown.tsx';

const render = (
  body: string,
  onPick?: (text: string) => void,
  slot?: { after: string; node: React.ReactNode },
) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter>
      <Markdown onPick={onPick} slot={slot}>
        {body}
      </Markdown>
    </MemoryRouter>,
  );
};

const note = (over: Partial<NoteDetail> = {}): NoteDetail =>
  ({
    id: 12,
    title: 'what was recorded',
    layer: 'past',
    amendment: {
      action: 'save_note',
      title: '[Amendment] what was recorded',
      link: '[[what was recorded]]',
      layer: 'past',
      amends: 12,
    },
    ...over,
  }) as NoteDetail;

describe('picking a paragraph', () => {
  // Reading is the default. A body that reacts to every click would make a note
  // you only wanted to read feel like a form.
  it('leaves the body alone when nothing can be done with it', () => {
    const html = render('a plain paragraph');

    expect(html).not.toContain('cursor-text');
  });

  it('marks the paragraphs as reachable when they are', () => {
    const html = render('a plain paragraph', () => {});

    expect(html).toContain('cursor-text');
  });
});

describe('what a correction starts from', () => {
  const t = dictionaries.en;

  it('quotes the paragraph the reader was looking at', () => {
    const draft = correctionDraft(note(), t, 'the trial is 14 days');

    expect(draft?.body).toContain('> the trial is 14 days');
    expect(draft?.amends).toBe(12);
  });

  // Correcting from the header button names no paragraph, and inventing one
  // would put words in the note that nobody pointed at.
  it('quotes nothing when nothing was pointed at', () => {
    const draft = correctionDraft(note(), t);

    expect(draft?.body).not.toContain('>');
  });

  // past is never edited in place, so the draft that replaces the editor has to
  // carry the link that makes it a correction rather than a new note.
  it('is always a correction, never an edit', () => {
    const draft = correctionDraft(note(), t, 'x');

    expect(draft?.fixedLayer).toBe(true);
    expect(draft?.body).toContain('[[what was recorded]]');
  });
});

describe('writing where the reader was looking', () => {
  const body = 'first paragraph\n\nsecond paragraph\n\nthird paragraph';

  // A note at the 90th percentile of this vault is 15,000 characters. Opening
  // the draft at the top means scrolling back to what you were reading.
  it('puts the draft under the paragraph it is about', () => {
    const html = render(body, () => {}, {
      after: 'second paragraph',
      node: <b>THE DRAFT</b>,
    });

    const draftAt = html.indexOf('THE DRAFT');
    expect(html.indexOf('second paragraph')).toBeLessThan(draftAt);
    expect(draftAt).toBeLessThan(html.indexOf('third paragraph'));
  });

  it('marks the paragraph being corrected, and stops offering to correct it again', () => {
    const html = render(body, () => {}, { after: 'second paragraph', node: null });

    expect(html).toContain('bg-accent-soft');
    // The other two are still reachable; the one being written about is not.
    expect(html.split('cursor-text').length - 1).toBe(2);
  });
});
