import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dictionaries, setLocale } from './i18n.ts';
import { ModelSelect } from './ModelSelect.tsx';
import { DEFAULT_CHOICE } from './models.ts';

const t = dictionaries.en;

const render = (choice = DEFAULT_CHOICE) => {
  setLocale('en');
  return renderToStaticMarkup(
    <ModelSelect choice={choice} onPick={() => {}} label={t.chat.model} />,
  );
};

// The catalogue arrives from `/api/models` in an effect, which does not run
// here. So this is the menu drawn before the CLIs have answered — the one a
// person sees for the first few seconds, and the only one they see on a machine
// where neither CLI is installed.
describe('the model picker, before the CLIs have answered', () => {
  it('groups by provider rather than pouring every model into one list', () => {
    const html = render();
    expect(html).toContain('<optgroup label="Claude Code">');
    expect(html).toContain('<optgroup label="Codex (ChatGPT)">');
  });

  it('draws the names memex can stand behind without asking anyone', () => {
    const html = render();
    for (const label of ['Claude Sonnet', 'Claude Opus', 'Claude Haiku', 'Claude Fable']) {
      expect(html).toContain(label);
    }
  });

  it('keeps asking for nothing as a choice, because it cannot go stale', () => {
    expect(render()).toContain('value="codex:">Account default');
  });

  it('offers a way in for a model the list does not carry, once per provider', () => {
    const html = render();
    expect(html).toContain(`value="claude-code:__custom__">${t.chat.customModel}`);
    expect(html).toContain(`value="codex:__custom__">${t.chat.customModel}`);
  });

  it('shows a model it does not recognise rather than a blank box', () => {
    const html = render({ provider: 'claude-code', model: 'claude-opus-4-6[1m]' });
    expect(html).toContain('claude-opus-4-6[1m]');
    expect(html).toContain('selected=""');
  });

  it('does not add a duplicate row for a model that is already listed', () => {
    const html = render({ provider: 'claude-code', model: 'sonnet' });
    expect(html.match(/value="claude-code:sonnet"/g)).toHaveLength(1);
  });
});
