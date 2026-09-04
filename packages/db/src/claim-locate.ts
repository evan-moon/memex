// Where a retired claim actually sits. `invalidates` names the sentence a
// correction replaces, and until now nothing checked whether that sentence was
// anywhere in the note being corrected. So a correction that retired one line
// put the whole note under suspicion, which is how 37 notes came to be read as
// "no longer true" while still being true.
//
// Locating the sentence is what lets the notice say which part went and that
// the rest stands. Matching is deliberately strict: failing to find a claim
// falls back to the whole-note warning, which is safe, while a loose match
// would clear a note that is actually wrong.
export type ClaimWhere = 'passage' | 'elsewhere' | 'unlocated';

export type LocatedClaim = { text: string; where: ClaimWhere };

const normalize = (text: string): string =>
  text
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const locateClaims = (
  claims: readonly string[],
  content: string,
  passage?: string | null,
): LocatedClaim[] => {
  const body = normalize(content);
  // A passage is only ever used to strengthen the notice, never to soften it:
  // an FTS snippet is elided, so not finding a claim in one proves nothing.
  const shown = passage ? normalize(passage) : '';

  return claims.map((text) => {
    const needle = normalize(text);
    if (needle.length === 0) return { text, where: 'unlocated' };
    if (shown.length > 0 && shown.includes(needle)) return { text, where: 'passage' };
    return { text, where: body.includes(needle) ? 'elsewhere' : 'unlocated' };
  });
};

/** What the located claims let a notice say about the note as a whole. */
export type ClaimScope =
  // A retired claim is inside the passage that matched. The strongest thing a
  // notice can say, and the only one that needs the passage.
  | 'passage'
  // Every retired claim was found, and none of them is what matched. The note
  // is partly superseded rather than superseded.
  | 'partial'
  // Nothing was named, or a named claim is nowhere in the note. Say what has
  // always been said: read the correction before relying on this.
  | 'whole';

export const claimScope = (located: readonly LocatedClaim[]): ClaimScope => {
  if (located.length === 0) return 'whole';
  if (located.some((claim) => claim.where === 'passage')) return 'passage';
  return located.every((claim) => claim.where === 'elsewhere') ? 'partial' : 'whole';
};
