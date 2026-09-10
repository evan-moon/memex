// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type Overview as Data, type Home } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { Overview } from './Overview.tsx';

const t = dictionaries.ko;

let host: HTMLDivElement;
let root: Root;

const vault = (notes: number): Data => ({
  notes,
  chunks: 0,
  links: { wiki: 0, amends: 0 },
  topics: 3,
  changed: 0,
  review: 0,
  activity: [],
  staleness: [],
});

const home = (over: Partial<Home> = {}): Home => ({
  continuing: null,
  recent: [],
  changes: [],
  ...over,
});

const document_ = (id: number, title: string) => ({
  id,
  title,
  folder: 'writing',
  updatedAt: Date.now(),
  snippet: '처음에는 대답을 얻으려고 AI를 썼다.',
});

beforeEach(() => {
  setLocale('ko');
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, 'deck').mockResolvedValue({ cards: [], session: 0, binge: false });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const show = async (data: Data) => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Overview data={data} topics={[]} />
      </MemoryRouter>,
    );
  });
};

describe('the home screen', () => {
  // The premise this redesign replaced: the review deck used to open the screen
  // and be the day's assigned work. What opens it now is the writing.
  it('opens on what the person was in the middle of', async () => {
    vi.spyOn(api, 'home').mockResolvedValue(
      home({ continuing: document_(1, 'AI와 일하며 달라진 것') }),
    );

    await show(vault(40));

    expect(host.textContent).toContain(t.home.continuing);
    expect(host.textContent).toContain('AI와 일하며 달라진 것');
    expect(host.textContent).toContain('처음에는 대답을 얻으려고');
  });

  it('lists what was edited lately, and says that is what it is sorted by', async () => {
    vi.spyOn(api, 'home').mockResolvedValue(
      home({ recent: [document_(2, '출시 계획'), document_(3, '인터뷰 메모')] }),
    );

    await show(vault(40));

    expect(host.textContent).toContain(t.home.recent);
    expect(host.textContent).toContain('출시 계획');
    expect(host.textContent).toContain('인터뷰 메모');
  });

  // Left out entirely rather than shown empty. A heading over nothing reads as
  // a screen that failed to load.
  it('leaves out a section it has nothing for', async () => {
    vi.spyOn(api, 'home').mockResolvedValue(home());

    await show(vault(40));

    expect(host.textContent).not.toContain(t.home.continuing);
    expect(host.textContent).not.toContain(t.home.recent);
  });

  it('still sends a brand new vault to the empty state', async () => {
    vi.spyOn(api, 'home').mockResolvedValue(home());

    await show(vault(0));

    expect(host.textContent).toContain(t.overview.emptyTitle);
  });
});
