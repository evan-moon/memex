// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type DocumentReference, type LibraryRow } from './api.ts';
import { ContextBar, type Picked } from './ContextBar.tsx';
import { dictionaries, setLocale } from './i18n.ts';

const t = dictionaries.ko;

let host: HTMLDivElement;
let root: Root;

const reference = (title: string): DocumentReference => ({
  id: 1,
  ownerDocumentId: 10,
  sourceDocumentId: 20,
  sourceRevision: null,
  quote: '',
  heading: null,
  at: 0,
  title,
  state: 'current',
});

const instruction = (id: number, title: string): LibraryRow => ({
  id,
  title,
  folder: 'rules',
  kind: 'instruction',
  origin: 'person',
  updatedAt: 0,
  writingStatus: null,
});

const empty: Picked = { targetId: null, referenceIds: [], instructionIds: [] };

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

const show = async (picked: Picked, onPicked: (next: Picked) => void = () => {}) => {
  await act(async () => {
    root.render(
      <ContextBar
        targetId={10}
        targetTitle="AI와 일하며 달라진 것"
        picked={picked}
        onPicked={onPicked}
        provider="claude · opus"
      />,
    );
  });
};

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((el) => el.textContent === label);

const press = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('ContextBar', () => {
  it('says what the request is about and what it goes through', async () => {
    vi.spyOn(api, 'references').mockResolvedValue([]);
    vi.spyOn(api, 'library').mockResolvedValue({
      rows: [],
      counts: { all: 0, mine: 0, reference: 0, instruction: 0 },
    });

    await show(empty);

    expect(host.textContent).toContain('AI와 일하며 달라진 것');
    expect(host.textContent).toContain('claude · opus');
  });

  it('names the material attached to the document', async () => {
    vi.spyOn(api, 'references').mockResolvedValue([reference('2026년 3월 인터뷰 메모')]);
    vi.spyOn(api, 'library').mockResolvedValue({
      rows: [],
      counts: { all: 0, mine: 0, reference: 0, instruction: 0 },
    });

    await show(empty);

    expect(host.textContent).toContain('2026년 3월 인터뷰 메모');
  });

  // A14. A writing skill nobody chose is not applied, and the bar says so
  // rather than leaving somebody to assume either way.
  it('follows nothing until something is chosen', async () => {
    vi.spyOn(api, 'references').mockResolvedValue([]);
    vi.spyOn(api, 'library').mockResolvedValue({
      rows: [instruction(5, '담백하게 쓰기')],
      counts: { all: 1, mine: 0, reference: 0, instruction: 1 },
    });

    await show(empty);

    expect(host.textContent).toContain(t.context.noInstructions);
    expect(host.textContent).not.toContain('담백하게 쓰기');
  });

  it('takes one when it is chosen, and hands it back', async () => {
    vi.spyOn(api, 'references').mockResolvedValue([]);
    vi.spyOn(api, 'library').mockResolvedValue({
      rows: [instruction(5, '담백하게 쓰기')],
      counts: { all: 1, mine: 0, reference: 0, instruction: 1 },
    });
    const picks: Picked[] = [];
    await show(empty, (next) => {
      picks.push(next);
    });

    const choose = button(t.context.choose);
    expect(choose).toBeDefined();
    if (choose) press(choose);

    const skill = button('담백하게 쓰기');
    expect(skill).toBeDefined();
    if (skill) press(skill);

    expect(picks).toEqual([{ targetId: null, referenceIds: [], instructionIds: [5] }]);
  });

  it('shows what is already being followed', async () => {
    vi.spyOn(api, 'references').mockResolvedValue([]);
    vi.spyOn(api, 'library').mockResolvedValue({
      rows: [instruction(5, '담백하게 쓰기')],
      counts: { all: 1, mine: 0, reference: 0, instruction: 1 },
    });

    await show({ ...empty, instructionIds: [5] });

    expect(host.textContent).toContain('담백하게 쓰기');
    expect(host.textContent).not.toContain(t.context.noInstructions);
  });
});
