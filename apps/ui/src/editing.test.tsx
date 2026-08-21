import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { NoteDetail } from './api.ts';
import { NoteItem } from './bits.tsx';
import { correctionDraft, missingNoteDraft } from './drafts.ts';
import { Composer, NoteEditor } from './editing.tsx';
import { dictionaries, setLocale } from './i18n.ts';

const t = dictionaries.en;

const note = (over: Partial<NoteDetail> = {}): NoteDetail => ({
  id: 7,
  title: 'a plan',
  content: 'the body',
  layer: 'state',
  author: 'person',
  at: Date.now(),
  tags: ['one', 'two'],
  obsidianUrl: null,
  deadLinks: [],
  evidence: [],
  candidateSources: [],
  hypotheses: [],
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

describe('the body field', () => {
  it('paints the markdown behind the text a person types', () => {
    const html = render(
      <NoteEditor
        note={note({ content: '## 배경\n\nsee [[Some Note]]' })}
        onSaved={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain('var(--brand)');
    expect(html).toContain('[[Some Note]]');
  });

  it('leaves the typed text itself transparent, so only one copy is visible', () => {
    const html = render(
      <NoteEditor note={note()} onSaved={() => undefined} onCancel={() => undefined} />,
    );
    expect(html).toContain('text-transparent');
    expect(html).toContain('caret-foreground');
  });
});

describe('Composer', () => {
  const past = note({
    layer: 'past',
    amendment: {
      action: 'save_note',
      title: '[Amendment] what happened',
      link: '[[what happened]]',
      layer: 'past',
      amends: 7,
    },
  });

  it('starts a correction from the amendment the server proposed', () => {
    const draft = correctionDraft(past, t);
    expect(draft).not.toBeNull();
    if (!draft) return;

    const html = render(<Composer draft={draft} note={past} onCancel={() => undefined} />);
    expect(html).toContain('[Amendment] what happened');
    expect(html).toContain('[[what happened]]');
    expect(html).toContain('projects/memex');
  });

  it('offers no correction for a note that can simply be edited', () => {
    expect(correctionDraft(note(), t)).toBeNull();
  });

  it('starts a missing note from the name that pointed nowhere', () => {
    const draft = missingNoteDraft('a note nobody wrote', t);
    const html = render(<Composer draft={draft} note={note()} onCancel={() => undefined} />);
    expect(html).toContain('a note nobody wrote');
    expect(html).toContain(t.edit.createNote);
  });

  it('lets a new note choose its layer, but never a correction', () => {
    const missing = render(
      <Composer draft={missingNoteDraft('x', t)} note={note()} onCancel={() => undefined} />,
    );
    expect(missing).toContain(t.edit.layer);

    const draft = correctionDraft(past, t);
    if (!draft) return;
    expect(render(<Composer draft={draft} note={past} onCancel={() => undefined} />)).not.toContain(
      t.edit.layer,
    );
  });
});

describe('the agent marker', () => {
  it('marks a note an agent keeps for itself', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <NoteItem note={{ id: 1, title: 'drivers', layer: 'state', author: 'agent', at: 1 }} />
      </MemoryRouter>,
    );
    expect(html).toContain(dictionaries.en.note.agent);
  });

  it("leaves the person's own memory unmarked", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <NoteItem note={{ id: 1, title: 'a plan', layer: 'state', author: 'person', at: 1 }} />
      </MemoryRouter>,
    );
    expect(html).not.toContain(dictionaries.en.note.agent);
  });
});
