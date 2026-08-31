import { describe, expect, it } from 'vitest';
import { targetOnScreen } from './chat-target.ts';

const none = new URLSearchParams();

describe('targetOnScreen', () => {
  it('reads the note the reader is on', () => {
    expect(targetOnScreen(none, '/note/2251')).toEqual({ kind: 'note', id: 2251 });
  });

  it('reads the topic the reader is on', () => {
    expect(targetOnScreen(none, '/topic/memex')).toEqual({ kind: 'topic', tag: 'memex' });
  });

  it('decodes a topic that needed escaping', () => {
    expect(targetOnScreen(none, '/topic/%EA%B8%B0%EC%96%B5')).toEqual({
      kind: 'topic',
      tag: '기억',
    });
  });

  it('reads the register subject the reader is on', () => {
    expect(targetOnScreen(none, '/register/opula')).toEqual({
      kind: 'register',
      subject: 'opula',
    });
  });

  // A screen that is not about one thing carries nothing, which is the honest
  // answer: an empty chat opened from the tag list is not about a tag.
  it('carries nothing from a screen that names nothing', () => {
    expect(targetOnScreen(none, '/tags')).toBeNull();
    expect(targetOnScreen(none, '/')).toBeNull();
  });

  it('lets an explicit parameter win over the route', () => {
    expect(targetOnScreen(new URLSearchParams('note=7'), '/topic/memex')).toEqual({
      kind: 'note',
      id: 7,
    });
  });
});
