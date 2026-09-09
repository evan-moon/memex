import { describe, expect, it } from 'vitest';
import { actorOf } from './actor.ts';

describe('actorOf', () => {
  // Somebody typing into a terminal. This is the only case that is the person.
  it('is the person at a terminal', () => {
    expect(actorOf({ isTTY: true })).toBe('user');
  });

  // A script, CI, or an agent that spawned a shell. Being local is not being
  // the vault owner, and treating it as one makes every restriction in the app
  // trivial to walk around.
  it('is not the person when nothing is attached', () => {
    expect(actorOf({ isTTY: false })).toBe('agent');
    expect(actorOf({})).toBe('agent');
  });
});
