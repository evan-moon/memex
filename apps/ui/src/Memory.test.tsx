// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type MemoryPage, type MemoryView } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { MemoryScreen } from './Memory.tsx';

const t = dictionaries.ko;

let host: HTMLDivElement;
let root: Root;

const item = (over: Partial<MemoryView> = {}): MemoryView => ({
  id: 'register:1',
  subjectKey: '출시 계획',
  statement: '출시 목표: 9월',
  status: 'unconfirmed',
  evidenceState: 'current',
  evidence: [{ documentId: 7, title: '출시 회의 기록' }],
  supersededBy: null,
  at: Date.now(),
  ...over,
});

const page = (items: MemoryView[]): MemoryPage => ({
  subjects: [{ subject: '출시 계획', keys: 1, lastAt: Date.now() }],
  items,
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
        <MemoryScreen />
      </MemoryRouter>,
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

describe('MemoryScreen', () => {
  it('shows what is recorded, and on what', async () => {
    vi.spyOn(api, 'memory').mockResolvedValue(page([item()]));

    await show();

    expect(host.textContent).toContain('출시 목표: 9월');
    expect(host.textContent).toContain('출시 회의 기록');
  });

  // A source that moved is a reason to look, never a reason to decide. The
  // screen marks the evidence and leaves the standing alone.
  it('marks a source that moved without touching what the memory says', async () => {
    vi.spyOn(api, 'memory').mockResolvedValue(page([item({ evidenceState: 'changed' })]));

    await show();

    expect(host.textContent).toContain(t.memory.evidence.changed);
    expect(host.textContent).toContain(t.memory.status.unconfirmed);
  });

  // The gap this screen closes: "this is wrong" used to lead nowhere.
  it('takes the new value in the same place the old one is read', async () => {
    vi.spyOn(api, 'memory').mockResolvedValue(page([item()]));
    const correct = vi.spyOn(api, 'correctMemory').mockResolvedValue({
      target: 'register:1',
      status: 'confirmed',
      statement: '출시 목표: 10월',
    });
    await show();

    const wrong = button(t.memory.wrong);
    expect(wrong).toBeDefined();
    if (wrong) press(wrong);

    const field = host.querySelector('input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(field, '10월');
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const apply = button(t.memory.apply);
    if (apply) press(apply);
    await act(async () => {});

    expect(correct).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'register:1', replacement: '10월' }),
    );
  });

  // Not knowing the new value must not stop somebody saying the old one is wrong.
  it('lets a memory be retired with nothing to put in its place', async () => {
    vi.spyOn(api, 'memory').mockResolvedValue(page([item()]));
    const correct = vi
      .spyOn(api, 'correctMemory')
      .mockResolvedValue({ target: 'register:1', status: 'retired', statement: '출시 목표: 9월' });
    await show();

    const wrong = button(t.memory.wrong);
    if (wrong) press(wrong);
    const retire = button(t.memory.retire);
    expect(retire).toBeDefined();
    if (retire) press(retire);
    await act(async () => {});

    expect(correct).toHaveBeenCalledWith(expect.objectContaining({ replacement: undefined }));
  });

  it('does not offer to correct something already retired', async () => {
    vi.spyOn(api, 'memory').mockResolvedValue(page([item({ status: 'retired' })]));

    await show();

    expect(button(t.memory.wrong)).toBeUndefined();
  });

  it('says so when nothing is recorded', async () => {
    vi.spyOn(api, 'memory').mockResolvedValue({ subjects: [], items: [] });

    await show();

    expect(host.textContent).toContain(t.memory.empty);
  });
});
