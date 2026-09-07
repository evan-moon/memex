import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AskName } from './AskName.tsx';
import { dictionaries, setLocale } from './i18n.ts';

const t = dictionaries.ko;

const render = (initial: string) => {
  setLocale('ko');
  return renderToStaticMarkup(
    <AskName
      question={{
        heading: t.menu.newFolderPrompt,
        initial,
        submitLabel: t.menu.newFolderConfirm,
        onAnswer: () => undefined,
      }}
      onClose={() => undefined}
    />,
  );
};

// Electron throws on `window.prompt`, so the three menu items that needed a
// name did nothing at all. This is what replaced it.
describe('AskName', () => {
  it('asks what it needs and opens with what was there', () => {
    const html = render('projects');
    expect(html).toContain(t.menu.newFolderPrompt);
    expect(html).toContain('value="projects"');
    expect(html).toContain(t.menu.newFolderConfirm);
  });

  it('cannot be submitted with nothing in it', () => {
    expect(render('')).toContain('disabled');
  });
});
