import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dictionaries, setLocale } from './i18n.ts';
import { ModelSelect } from './ModelSelect.tsx';
import { type Choice, DEFAULT_CHOICE } from './models.ts';

const t = dictionaries.en;

const render = (choice: Choice = DEFAULT_CHOICE) => {
  setLocale('en');
  return renderToStaticMarkup(
    <ModelSelect choice={choice} onPick={() => {}} label={t.chat.model} />,
  );
};

// The menu itself opens on a press, so what is drawn on the page is the one
// line the picker is worth: which model the next call will use.
describe('the model picker, closed', () => {
  it('says the model rather than the word "model"', () => {
    expect(render()).toContain('Claude Sonnet');
  });

  it('shows a name the catalogue does not carry rather than an empty button', () => {
    expect(render({ provider: 'claude-code', model: 'claude-opus-4-6[1m]' })).toContain(
      'claude-opus-4-6[1m]',
    );
  });

  it('keeps the menu out of the page until it is asked for', () => {
    const html = render();
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(t.chat.searchModels);
  });
});
