export type SaveState = 'clean' | 'dirty' | 'saving' | 'failed';

export type Write<T> = (value: T) => Promise<unknown>;

// One document, one write at a time, and a number on each so a response can be
// told from a stale one. Without the number the last thing typed is marked saved
// by a write that started before it was typed — which the experience spec calls
// a completion blocker, and which is the whole reason this exists.
export const createSaveQueue = <T>(write: Write<T>, onState?: (state: SaveState) => void) => {
  const held = { value: undefined as T | undefined, has: false };
  const at = { queued: 0, sent: 0, acknowledged: 0 };
  const status = { state: 'clean' as SaveState };
  let running: Promise<void> | null = null;

  const moveTo = (next: SaveState) => {
    if (status.state === next) return;
    status.state = next;
    onState?.(next);
  };

  const drain = async (): Promise<void> => {
    while (held.has) {
      const value = held.value as T;
      const sequence = at.queued;
      held.has = false;
      at.sent = sequence;
      moveTo('saving');
      try {
        await write(value);
        at.acknowledged = sequence;
        // Only the write that carried the newest input may call it clean. A
        // slower one landing after a fresh keystroke says nothing about it.
        if (!held.has) moveTo('clean');
      } catch {
        moveTo('failed');
        // Kept, not dropped: a failed write is an edit that still exists only
        // here, and the retry has to have something to send.
        held.value = value;
        held.has = true;
        running = null;
        return;
      }
    }
    running = null;
  };

  const start = () => {
    if (running !== null) return;
    running = drain();
  };

  return {
    push: (value: T) => {
      held.value = value;
      held.has = true;
      at.queued += 1;
      if (status.state !== 'saving') moveTo('dirty');
      start();
    },
    // Deliberately does not resend on its own. A write that failed because the
    // disk is full fails again a millisecond later, and a queue that retried by
    // itself would spend the battery saying so.
    retry: () => {
      if (!held.has) return;
      moveTo('dirty');
      start();
    },
    settled: async () => {
      while (running !== null) await running;
    },
    state: () => status.state,
    unsaved: () => (held.has ? held.value : undefined),
    // What the window asks before it closes. Not whether every write finished,
    // but whether anything the person typed exists only in this tab.
    safeToClose: () => !held.has && running === null,
  };
};
