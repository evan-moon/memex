// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextMenu, type MenuItem } from './ContextMenu.tsx';
import { setLocale } from './i18n.ts';

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

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((el) => el.textContent === label);

// What the mouse actually sends, in order — and in two turns, because that is
// what the browser does. Sending both inside one `act` batches the render away
// and the button is still there when the click arrives, which is the one thing
// that never happens in a window. The bug lived in exactly that gap.
const press = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// The menu as its callers hold it: open until it says to close. Rendering it
// unconditionally would hide the bug, because the button would still be there
// when the click arrived.
const Held = ({ items }: { items: MenuItem[] }) => {
  const [open, setOpen] = useState(true);
  return open ? (
    <ContextMenu at={{ x: 10, y: 10 }} items={items} onClose={() => setOpen(false)} />
  ) : null;
};

describe('ContextMenu', () => {
  it('runs the item that was clicked', () => {
    const picked: string[] = [];
    act(() =>
      root.render(
        <Held items={[{ kind: 'item', label: '열기', onPick: () => picked.push('열기') }]} />,
      ),
    );

    const item = button('열기');
    expect(item).toBeDefined();
    if (item) press(item);

    expect(picked).toEqual(['열기']);
    expect(button('열기')).toBeUndefined();
  });

  it('closes on a press outside without running anything', () => {
    const picked: string[] = [];
    act(() =>
      root.render(
        <Held items={[{ kind: 'item', label: '삭제', onPick: () => picked.push('삭제') }]} />,
      ),
    );

    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    expect(picked).toEqual([]);
    expect(button('삭제')).toBeUndefined();
  });

  it('closes on Escape', () => {
    act(() => root.render(<Held items={[{ kind: 'item', label: '복제', onPick: () => {} }]} />));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(button('복제')).toBeUndefined();
  });
});
