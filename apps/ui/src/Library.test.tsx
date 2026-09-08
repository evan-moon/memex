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
  rows: rows.map((row) => ({
    ...row,
    kind: 'note',
    origin: 'unknown',
    updatedAt: Date.now(),
    writingStatus: null,
  })),
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

  // The answer to a folder holding both somebody's own writing and somebody
  // else's: the folder is a bulk guess and a row can disagree with it.
  it('lets one row be claimed without touching the rest', async () => {
    vi.spyOn(api, 'library').mockResolvedValue(
      page([
        { id: 1, title: '내가 쓴 글', folder: 'posts' },
        { id: 2, title: '남이 쓴 글', folder: 'posts' },
      ]),
    );
    const claim = vi.spyOn(api, 'setOrigin').mockResolvedValue({ origin: 'person' });

    await show();

    const buttons = [...host.querySelectorAll('button')].filter(
      (el) => el.textContent === t.library.origins.unknown,
    );
    expect(buttons).toHaveLength(2);

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});

    expect(claim).toHaveBeenCalledWith(1, 'person');
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('offers to take a claim back once it is made', async () => {
    vi.spyOn(api, 'library').mockResolvedValue(page([{ id: 1, title: '내 글', folder: 'posts' }]));
    // biome-ignore lint/suspicious/noExplicitAny: narrowing the mock's row shape is not the point of this test
    (api.library as any).mockResolvedValue({
      subjects: [],
      counts: { all: 1, mine: 1, reference: 0, instruction: 0 },
      rows: [
        {
          id: 1,
          title: '내 글',
          folder: 'posts',
          kind: 'note',
          origin: 'person',
          updatedAt: Date.now(),
          writingStatus: null,
        },
      ],
    });
    const claim = vi.spyOn(api, 'setOrigin').mockResolvedValue({ origin: 'unknown' });

    await show();

    const mine = [...host.querySelectorAll('button')].find(
      (el) => el.textContent === t.library.origins.person,
    );
    expect(mine).toBeDefined();
    if (mine) {
      act(() => {
        mine.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      });
      act(() => {
        mine.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    await act(async () => {});

    expect(claim).toHaveBeenCalledWith(1, 'unknown');
  });
});
