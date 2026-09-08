import { describe, expect, it } from 'vitest';
import { createSaveQueue } from './save-queue.ts';

// A promise the test decides when to settle. Every defect this module exists for
// is a timing one, and timing that cannot be held still cannot be tested.
const deferred = <T>() => {
  let settle: (value: T) => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  const promise = new Promise<T>((resolve, no) => {
    settle = resolve;
    reject = no;
  });
  return { promise, settle, reject };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSaveQueue', () => {
  it('writes what it was given', async () => {
    const written: string[] = [];
    const queue = createSaveQueue<string>(async (value) => {
      written.push(value);
    });

    queue.push('one');
    await queue.settled();

    expect(written).toEqual(['one']);
  });

  // The defect the experience spec calls a completion blocker: a save that
  // started before the last keystroke comes back and says the document is clean.
  it('does not call the document saved when newer input is waiting', async () => {
    const first = deferred<void>();
    // The second write never settles, so what is asserted is the state left
    // behind by the first one landing after a newer keystroke — not the state
    // after the queue quietly caught up.
    let call = 0;
    const queue = createSaveQueue<string>(() => {
      call += 1;
      return call === 1 ? first.promise : new Promise<void>(() => {});
    });

    queue.push('one');
    await tick();
    queue.push('two');
    first.settle();
    await tick();

    expect(queue.state()).not.toBe('clean');
    expect(call).toBe(2);
  });

  // Typing during a save is not a lost keystroke. It becomes the next write.
  it('carries input that arrived mid-save into the write after it', async () => {
    const written: string[] = [];
    const first = deferred<void>();
    const queue = createSaveQueue<string>(async (value) => {
      written.push(value);
      if (written.length === 1) await first.promise;
    });

    queue.push('one');
    await tick();
    queue.push('two');
    first.settle();
    await queue.settled();

    expect(written).toEqual(['one', 'two']);
    expect(queue.state()).toBe('clean');
  });

  // Two keystrokes during one write are one write afterwards, not two. What is
  // saved is the document, not each step it passed through.
  it('collapses everything that piled up into a single later write', async () => {
    const written: string[] = [];
    const first = deferred<void>();
    const queue = createSaveQueue<string>(async (value) => {
      written.push(value);
      if (written.length === 1) await first.promise;
    });

    queue.push('one');
    await tick();
    queue.push('two');
    queue.push('three');
    queue.push('four');
    first.settle();
    await queue.settled();

    expect(written).toEqual(['one', 'four']);
  });

  it('never has two writes of one document in flight at once', async () => {
    let inFlight = 0;
    let seenAtOnce = 0;
    const gate = deferred<void>();
    const queue = createSaveQueue<string>(async () => {
      inFlight += 1;
      seenAtOnce = Math.max(seenAtOnce, inFlight);
      await gate.promise;
      inFlight -= 1;
    });

    queue.push('one');
    queue.push('two');
    await tick();
    gate.settle();
    await queue.settled();

    expect(seenAtOnce).toBe(1);
  });

  it('says it failed and keeps what could not be written', async () => {
    const queue = createSaveQueue<string>(async () => {
      throw new Error('disk full');
    });

    queue.push('one');
    await queue.settled();

    expect(queue.state()).toBe('failed');
    expect(queue.unsaved()).toBe('one');
  });

  // A retry after a failure is the same edit, not a new one, so the queue hands
  // back what it was still holding rather than asking the caller to remember.
  it('tries the same edit again when asked', async () => {
    const written: string[] = [];
    let refuse = true;
    const queue = createSaveQueue<string>(async (value) => {
      if (refuse) throw new Error('disk full');
      written.push(value);
    });

    queue.push('one');
    await queue.settled();
    refuse = false;
    queue.retry();
    await queue.settled();

    expect(written).toEqual(['one']);
    expect(queue.state()).toBe('clean');
  });

  it('has nothing to retry once everything landed', async () => {
    const queue = createSaveQueue<string>(async () => {});
    queue.push('one');
    await queue.settled();

    queue.retry();
    await queue.settled();

    expect(queue.state()).toBe('clean');
  });

  // What the window-close handshake asks. Not "did every write finish" but "is
  // anything the person typed still only in this tab".
  it('knows whether anything is still only in the buffer', async () => {
    const gate = deferred<void>();
    const queue = createSaveQueue<string>(() => gate.promise);

    expect(queue.safeToClose()).toBe(true);
    queue.push('one');
    expect(queue.safeToClose()).toBe(false);
    gate.settle();
    await queue.settled();
    expect(queue.safeToClose()).toBe(true);
  });
});
