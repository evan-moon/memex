import { describe, expect, it } from 'vitest';
import { readyToClose, whileEditing } from './closing.ts';

describe('readyToClose', () => {
  it('lets an empty window go', async () => {
    expect(await readyToClose()).toBe(true);
  });

  it('flushes what is open before it answers', async () => {
    const flushed: string[] = [];
    const stop = whileEditing({
      flush: async () => {
        flushed.push('one');
      },
      safeToClose: () => true,
    });

    expect(await readyToClose()).toBe(true);
    expect(flushed).toEqual(['one']);
    stop();
  });

  // The point of the handshake: a tab still holding a keystroke keeps the window
  // open rather than taking the paragraph down with it.
  it('holds the window while anything is still only in a tab', async () => {
    const stop = whileEditing({ flush: async () => {}, safeToClose: () => false });

    expect(await readyToClose()).toBe(false);
    stop();
  });

  it('does not let one tab’s failure speak for the others', async () => {
    const stopA = whileEditing({
      flush: async () => {
        throw new Error('disk full');
      },
      safeToClose: () => false,
    });
    const stopB = whileEditing({ flush: async () => {}, safeToClose: () => true });

    expect(await readyToClose()).toBe(false);
    stopA();
    expect(await readyToClose()).toBe(true);
    stopB();
  });

  it('forgets a tab that closed', async () => {
    const stop = whileEditing({ flush: async () => {}, safeToClose: () => false });
    stop();

    expect(await readyToClose()).toBe(true);
  });
});
