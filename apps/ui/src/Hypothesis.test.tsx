import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { InferenceDetail } from './api.ts';
import { HypothesisBody, HypothesisLinks } from './Hypothesis.tsx';
import { dictionaries, setLocale } from './i18n.ts';

const t = dictionaries.en;

const render = (element: React.ReactElement) => {
  setLocale('en');
  return renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);
};

const detail = (
  over: Partial<InferenceDetail['inference']> = {},
  evidence: InferenceDetail['evidence'] = [],
): InferenceDetail => ({
  inference: {
    id: 3,
    title: 'an epistemic engine',
    summary: 'the essays run on the same two axes',
    confidence: 0.75,
    status: 'stale',
    modelId: 'claude-opus-4-8',
    promptText: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  },
  evidence,
});

describe('HypothesisLinks', () => {
  it('says nothing when no hypothesis was read out of this', () => {
    expect(render(<HypothesisLinks heading="h" hint="x" refs={[]} />)).toBe('');
  });

  it('marks the one whose sources have moved', () => {
    const html = render(
      <HypothesisLinks
        heading={t.hypothesis.onNote}
        hint={t.hypothesis.onNoteHint}
        refs={[
          { id: 2, title: 'a curriculum', status: 'stale' },
          { id: 3, title: 'an engine', status: 'active' },
        ]}
      />,
    );
    expect(html).toContain('/inference/2');
    expect(html).toContain(t.hypothesis.stale);
    expect(html.match(new RegExp(t.hypothesis.stale, 'g'))).toHaveLength(1);
  });
});

describe('HypothesisBody', () => {
  it('names the model and how sure it was, since this is a reading not a record', () => {
    const html = render(<HypothesisBody detail={detail()} onChanged={() => undefined} />);
    expect(html).toContain(t.hypothesis.heading);
    expect(html).toContain(t.hypothesis.confidence(0.75));
    expect(html).toContain(t.hypothesis.by('claude-opus-4-8'));
  });

  it('offers to keep it only once something it stood on has moved', () => {
    const holding = render(
      <HypothesisBody
        detail={detail({}, [
          {
            noteId: 1,
            role: 'source',
            title: 'a',
            sourceExcerpt: null,
            changed: false,
            missing: false,
          },
        ])}
        onChanged={() => undefined}
      />,
    );
    expect(holding).toContain(t.hypothesis.holds);
    expect(holding).not.toContain(t.hypothesis.keep);

    const shaken = render(
      <HypothesisBody
        detail={detail({}, [
          {
            noteId: 1,
            role: 'source',
            title: 'a',
            sourceExcerpt: null,
            changed: true,
            missing: false,
          },
        ])}
        onChanged={() => undefined}
      />,
    );
    expect(shaken).toContain(t.hypothesis.shaken);
    expect(shaken).toContain(t.hypothesis.keep);
    expect(shaken).toContain(t.hypothesis.changed);
  });

  it('always offers to make it a note, and says what that means', () => {
    const html = render(<HypothesisBody detail={detail()} onChanged={() => undefined} />);
    expect(html).toContain(t.hypothesis.promote);
    expect(html).toContain(t.hypothesis.promoteHint);
  });

  it('keeps what the model was given behind a click', () => {
    const html = render(
      <HypothesisBody detail={detail({ promptText: 'the bundle' })} onChanged={() => undefined} />,
    );
    expect(html).toContain(t.hypothesis.showBundle);
    expect(html).not.toContain('the bundle');
  });
});
