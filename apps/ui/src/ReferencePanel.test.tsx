// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type DocumentReference } from './api.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { ReferencePanel } from './ReferencePanel.tsx';

const t = dictionaries.ko;

let host: HTMLDivElement;
let root: Root;

const reference = (over: Partial<DocumentReference> = {}): DocumentReference => ({
  id: 1,
  ownerDocumentId: 10,
  sourceDocumentId: 20,
  sourceRevision: 'r-1',
  quote: '도구를 바꾸면 일이 빨라질 거라고',
  heading: null,
  at: Date.now(),
  title: '인터뷰 메모',
  state: 'current',
  ...over,
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

const show = (
  references: DocumentReference[],
  onChanged: (next: DocumentReference[]) => void = () => {},
) =>
  act(() => {
    root.render(
      <MemoryRouter>
        <ReferencePanel documentId={10} references={references} onChanged={onChanged} />
      </MemoryRouter>,
    );
  });

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((el) => el.textContent?.includes(label));

const press = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('ReferencePanel', () => {
  it('shows what the document is being written from', () => {
    show([reference()]);

    expect(host.textContent).toContain('인터뷰 메모');
    expect(host.textContent).toContain('도구를 바꾸면');
  });

  it('says so when nothing is added yet', () => {
    show([]);
    expect(host.textContent).toContain(t.references.empty);
  });

  // The version on the reference is what makes this possible a month later.
  it('says when the passage it quoted has moved', () => {
    show([reference({ state: 'changed' })]);
    expect(host.textContent).toContain(t.references.changed);
  });

  it('says when the source is gone, and does not offer a link to nothing', () => {
    show([reference({ state: 'missing', title: null })]);

    expect(host.textContent).toContain(t.references.missing);
    expect(host.querySelector('a')).toBeNull();
  });

  // The one thing this panel must never do: adding a reference while the caret
  // is in the middle of a paragraph must leave the document where it was.
  it('adds without navigating anywhere', async () => {
    const added: DocumentReference[][] = [];
    vi.spyOn(api, 'search').mockResolvedValue({
      results: [{ id: 20, title: '인터뷰 메모', layer: 'past', at: 0, snippet: '' }],
      collapsed: [],
      limit: 6,
    });
    vi.spyOn(api, 'addReference').mockResolvedValue([reference()]);
    show([], (next) => {
      added.push(next);
    });

    const field = host.querySelector('input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(field, '인터뷰');
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const add = button(t.references.add);
    expect(add).toBeDefined();
    if (add) press(add);
    await act(async () => {});

    expect(api.addReference).toHaveBeenCalledWith(10, 20);
    expect(added).toHaveLength(1);
    expect(window.location.pathname).toBe('/');
  });
});
