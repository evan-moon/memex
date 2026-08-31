import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 900;

export type SaveState = 'clean' | 'dirty' | 'saving' | 'failed';

// A note that is always open for editing has no Save button to press, so the
// pause between keystrokes is what commits. Saving on every one would write a
// file per character; saving only on leaving would lose the last thing typed
// when the window closes.
export const useAutosave = <T>(value: T, dirty: boolean, save: (value: T) => Promise<unknown>) => {
  const [state, setState] = useState<SaveState>('clean');
  const latest = useRef({ value, dirty, save });
  latest.current = { value, dirty, save };

  useEffect(() => {
    if (!dirty) {
      setState('clean');
      return;
    }
    setState('dirty');
    const timer = setTimeout(() => {
      setState('saving');
      save(value)
        .then(() => setState('clean'))
        .catch(() => setState('failed'));
    }, IDLE_MS);
    return () => clearTimeout(timer);
  }, [value, dirty, save]);

  // Leaving the note is the other end of the same promise. Without this, the
  // last edit before a navigation lives only in the timer that just got torn
  // down with the component.
  useEffect(
    () => () => {
      const { value: last, dirty: unsaved, save: write } = latest.current;
      if (unsaved) write(last).catch(() => {});
    },
    [],
  );

  return state;
};
