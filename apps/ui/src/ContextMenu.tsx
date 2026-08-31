import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem =
  | { kind: 'item'; label: string; danger?: boolean; onPick: () => void }
  | { kind: 'divider' };

export type MenuAt = { x: number; y: number };

// Opened where the pointer is, then nudged back inside the window: a menu that
// hangs off the bottom edge is a menu whose last item cannot be reached.
export const ContextMenu = ({
  at,
  items,
  onClose,
}: {
  at: MenuAt;
  items: MenuItem[];
  onClose: () => void;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState(at);

  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    const { width, height } = el.getBoundingClientRect();
    setSpot({
      x: Math.min(at.x, window.innerWidth - width - 8),
      y: Math.min(at.y, window.innerHeight - height - 8),
    });
  }, [at]);

  useEffect(() => {
    const dismiss = () => onClose();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    // Capture, so a click that lands on something else closes this before that
    // something else acts on it.
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={box}
      // Opaque on purpose. `.glass` is for panels that want the page to show
      // through; a menu that does it becomes unreadable over a dense tree.
      className="memex-menu fixed z-50 min-w-52 rounded-xl py-1.5"
      style={{ left: spot.x, top: spot.y }}
    >
      {items.map((item, index) =>
        item.kind === 'divider' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a divider is identified by where it sits
          <div key={index} className="my-1.5 border-t border-glass-line" />
        ) : (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              onClose();
              item.onPick();
            }}
            className={`block w-full px-3.5 py-1.5 text-left text-[13px] hover:bg-surface-muted ${
              item.danger ? 'text-danger' : 'text-foreground'
            }`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
};
