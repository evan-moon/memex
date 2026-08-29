import { afterEach, describe, expect, it, vi } from 'vitest';
import { goBack, goForward } from './history.ts';

const withNavigation = (navigation?: unknown) =>
  vi.stubGlobal('window', navigation === undefined ? {} : { navigation });

afterEach(() => vi.unstubAllGlobals());

describe('going back and forward', () => {
  it('drives the browser rather than the router', () => {
    const calls: string[] = [];
    withNavigation({ back: () => calls.push('back'), forward: () => calls.push('forward') });

    goBack();
    goForward();

    expect(calls).toEqual(['back', 'forward']);
  });

  // `history.length` counts the whole session, entries ahead of you included, so
  // a disabled state built on it would be wrong in both directions. Where the
  // real answer is missing, pressing must still be harmless.
  it('does nothing rather than throwing when the browser cannot say', () => {
    withNavigation();

    expect(() => goBack()).not.toThrow();
    expect(() => goForward()).not.toThrow();
  });
});
