import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { NoteDetail } from './api.ts';
import { Correction, NoteEditor } from './editing.tsx';
import { dictionaries, setLocale } from './i18n.ts';

const t = dictionaries.en;

const note = (over: Partial<NoteDetail> = {}): NoteDetail => ({
  id: 7,
  title: 'a plan',
  content: 'the body',
  layer: 'state',
  at: Date.now(),
  tags: ['one', 'two'],
  obsidianUrl: null,
  folder: 'projects/memex',
  amendment: null,
  wikiLinks: [],
  stale: null,
  supersededBy: [],
  corrects: [],
  backlinks: [],
  related: [],
  ...over,
});

const render = (element: React.ReactElement) => {
  setLocale('en');
  return renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);
};

describe('NoteEditor', () => {
  it('opens on what the note already says', () => {
    const html = render(
      <NoteEditor note={note()} onSaved={() => undefined} onCancel={() => undefined} />,
    );
    expect(html).toContain('value="a plan"');
    expect(html).toContain('value="one, two"');
    expect(html).toContain('the body');
    expect(html).toMatch(/<option value="state"[^>]*selected/);
  });

  it('will not save a note nobody has changed', () => {
    const html = render(
      <NoteEditor note={note()} onSaved={() => undefined} onCancel={() => undefined} />,
    );
    expect(html).toMatch(new RegExp(`disabled[^>]*>${t.edit.save}`));
  });
});

describe('Correction', () => {
  it('starts from the amendment the server proposed', () => {
    const html = render(
      <Correction
        note={note({
          layer: 'past',
          amendment: {
            action: 'save_note',
            title: '[Amendment] what happened',
            link: '[[what happened]]',
            layer: 'past',
            amends: 7,
          },
        })}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain('[Amendment] what happened');
    expect(html).toContain('[[what happened]]');
    expect(html).toContain('projects/memex');
  });

  it('renders nothing for a note that can simply be edited', () => {
    expect(render(<Correction note={note()} onCancel={() => undefined} />)).toBe('');
  });
});
