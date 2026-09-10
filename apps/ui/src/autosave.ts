import { useCallback, useEffect, useRef, useState } from 'react';
import { createSaveQueue, type SaveState } from './save-queue.ts';

const IDLE_MS = 900;

export type { SaveState };

// A note that is always open for editing has no Save button to press, so the
// pause between keystrokes is what commits. Saving on every one would write a
// file per character; saving only on leaving would lose the last thing typed.
//
// The queue underneath is what makes "saved" mean the newest input, and what
// keeps a write alive after the component that started it has gone. The old
// unmount save was fire and forget, which is a promise nobody was holding.
export const useAutosave = <T>(value: T, dirty: boolean, save: (value: T) => Promise<unknown>) => {
  const [state, setState] = useState<SaveState>('clean');
  const write = useRef(save);
  write.current = save;

  const queue = useRef<ReturnType<typeof createSaveQueue<T>> | null>(null);
  if (queue.current === null) {
    queue.current = createSaveQueue<T>((next) => write.current(next), setState);
  }
  const held = queue.current;

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => held.push(value), IDLE_MS);
    return () => clearTimeout(timer);
  }, [value, dirty, held]);

  // What ⌘S does, and what the window asks on the way out: stop waiting for the
  // pause and send what is there.
  const flush = useCallback(() => {
    if (!dirty) return held.settled();
    held.push(value);
    return held.settled();
  }, [held, dirty, value]);

  const retry = useCallback(() => {
    held.retry();
    return held.settled();
  }, [held]);

  return { state, flush, retry, safeToClose: () => held.safeToClose(), unsaved: held.unsaved };
};
