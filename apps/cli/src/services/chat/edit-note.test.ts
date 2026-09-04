import { describe, expect, it } from 'vitest';
import { confirmationFor, parsePlanDraft } from './plan.ts';

// The chat could add a note beside a document but never change the document.
// That was right while every note was memex's own; a blog post memex only
// borrowed is the person's, and nobody amends a blog post with a second one.
describe('edit-note reaches the plan', () => {
  const parse = (json: string) => parsePlanDraft(json);

  it('is parsed when the model asks for one', () => {
    const draft = parse('{"action":"edit-note","id":437,"content":"고친 본문"}');
    expect(draft).toEqual({ action: 'edit-note', id: 437, content: '고친 본문' });
  });

  it('is refused without a body, so a fragment cannot overwrite a document', () => {
    expect(parse('{"action":"edit-note","id":437}')).toBeNull();
  });

  it('is refused without an id', () => {
    expect(parse('{"action":"edit-note","content":"고친 본문"}')).toBeNull();
  });

  // Rewriting a document is destructive in a way adding a note is not, so it is
  // never applied on the model's word alone.
  it('always waits for the person to press it', () => {
    expect(confirmationFor({ kind: 'edit-note', id: 437, content: 'x' }, null)).toBe('confirm');
    expect(
      confirmationFor({ kind: 'edit-note', id: 437, content: 'x' }, { kind: 'note', id: 437 }),
    ).toBe('confirm');
  });
});
