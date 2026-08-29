import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { NoteDetail } from './api.ts';
import { correctionDraft } from './drafts.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { Markdown } from './Markdown.tsx';

const render = (body: string, onPick?: (text: string) => void) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter>
      <Markdown onPick={onPick}>{body}</Markdown>
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
