import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { NoteDetail } from './api.ts';
import { NoteItem } from './bits.tsx';
import { correctionDraft, missingNoteDraft } from './drafts.ts';
import { Composer, NoteEditor } from './editing.tsx';
import { dictionaries, setLocale } from './i18n.ts';
import { isDirty, patchFor } from './patch.ts';

const t = dictionaries.en;

const note = (over: Partial<NoteDetail> = {}): NoteDetail => ({
  id: 7,
  title: 'a plan',
  content: 'the body',
  layer: 'state',
  author: 'person',
  at: Date.now(),
  updatedAt: Date.now(),
  tags: ['one', 'two'],
  filePath: '/vault/note.md',
  writable: true,
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
  // The body now lives in CodeMirror, which paints nothing until it is in a
  // browser. What static markup can still answer is whether the form was seeded
  // with this note rather than an empty one.
  it('opens on what the note already says', () => {
    const html = render(<NoteEditor note={note()} onSaved={() => undefined} />);
    expect(html).toContain('value="a plan"');
    // Tags and layer live behind Properties, folded away like the frontmatter
    // block next door. The title is the document's first line, so it is not.
    expect(html).toContain(t.edit.properties);
    expect(html).not.toContain('value="one, two"');
  });

  // There is no Save button to disable any more — the pause between keystrokes
  // commits. What stands in for it is the patch: an untouched note produces one
  // with nothing in it, and nothing gets written.
  it('will not save a note nobody has changed', () => {
    const untouched = note();
    const patch = patchFor(untouched, {
      title: untouched.title,
      tags: untouched.tags.join(', '),
      layer: untouched.layer,
      body: untouched.content,
    });

    expect(isDirty(patch)).toBe(false);
  });

  it('reports only the field that moved', () => {
    const before = note();
    const patch = patchFor(before, {
      title: before.title,
      tags: before.tags.join(', '),
      layer: before.layer,
      body: 'something else',
    });

    expect(patch).toEqual({
      title: undefined,
      tags: undefined,
      layer: undefined,
      body: 'something else',
    });
    expect(isDirty(patch)).toBe(true);
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

  // The body is CodeMirror's now, and it paints nothing outside a browser. What
  // the draft carries is the part worth protecting anyway: a correction opens
  // already pointing back at the note it corrects.
  it('starts a correction that points back at the note', () => {
    const draft = correctionDraft(past, t);
    expect(draft).not.toBeNull();
    if (!draft) return;

    expect(draft.title).toBe('[Amendment] what happened');
    expect(draft.body).toContain('[[what happened]]');
    expect(draft.amends).toBe(past.id);

    const html = render(<Composer draft={draft} note={past} onCancel={() => undefined} />);
    expect(html).toContain('[Amendment] what happened');
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
