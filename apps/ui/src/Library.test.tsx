// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { LibraryScreen } from './Library.tsx';

const t = dictionaries.ko;

let host: HTMLDivElement;
let root: Root;

const page = (rows: { id: number; title: string; folder: string }[]) => ({
  rows: rows.map((row) => ({ ...row, kind: 'note', updatedAt: Date.now(), writingStatus: null })),
  counts: { all: rows.length, mine: 0, reference: 0, instruction: 0 },
});

beforeEach(() => {
  setLocale('ko');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const show = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <LibraryScreen />
      </MemoryRouter>,
    );
  });
};

describe('LibraryScreen', () => {
  it('lists the documents on the shelf', async () => {
    vi.spyOn(api, 'library').mockResolvedValue(
      page([
        { id: 1, title: 'AI와 일하며 달라진 것', folder: 'writing' },
        { id: 2, title: '출시 계획', folder: 'projects' },
      ]),
    );

    await show();

    expect(host.textContent).toContain('AI와 일하며 달라진 것');
    expect(host.textContent).toContain('projects');
  });

  it('offers the four kinds with how many each holds', async () => {
    vi.spyOn(api, 'library').mockResolvedValue(page([{ id: 1, title: '하나', folder: '' }]));

    await show();

    for (const label of Object.values(t.library.filters)) {
      expect(host.textContent).toContain(label);
    }
  });

  // The empty state says nothing is there, rather than showing an empty list
  // that looks like a screen that failed to load.
  it('says so when a filter holds nothing', async () => {
    vi.spyOn(api, 'library').mockResolvedValue(page([]));

    await show();

    expect(host.textContent).toContain(t.library.empty);
  });
});
