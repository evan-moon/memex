// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AskName } from './AskName.tsx';
import { dictionaries, setLocale } from './i18n.ts';

const t = dictionaries.ko;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  setLocale('ko');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const ask = (initial: string, answered: string[]) => {
  act(() =>
    root.render(
      <AskName
        question={{
          heading: t.menu.newFolderPrompt,
          initial,
          submitLabel: t.menu.newFolderConfirm,
          onAnswer: (name) => answered.push(name),
        }}
        onClose={() => {}}
      />,
    ),
  );
  return host.querySelector('input');
};

const enter = (input: Element | null) =>
  act(() => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

// Electron throws on `window.prompt`, so the three menu items that needed a name
// did nothing at all. This is what replaced it.
describe('AskName', () => {
  it('asks what it needs and opens with what was there', () => {
    ask('projects', []);
    expect(host.textContent).toContain(t.menu.newFolderPrompt);
    expect(host.querySelector('input')?.value).toBe('projects');
  });

  it('answers with what is in it when Enter is pressed', () => {
    const answered: string[] = [];
    enter(ask('  projects  ', answered));
    expect(answered).toEqual(['projects']);
  });

  // A folder named by the space bar is a folder nobody can name again.
  it('answers nothing when there is nothing to answer with', () => {
    const answered: string[] = [];
    enter(ask('   ', answered));
    expect(answered).toEqual([]);
  });
});
