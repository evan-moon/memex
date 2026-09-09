import type { DocumentOrigin } from '@memex/db';

// Who wrote a note, answered once for the whole app. The tree and the library
// had this twice and disagreed: the tree called an imported file the person's
// writing, the library called it borrowed, and the same blog post was theirs in
// the sidebar and somebody else's in the library.
//
// The tree's answer is the right one and its own comment says why. `claude-code`
// is memex's write path, so an agent wrote it. `manual` is somebody typing in
// the app. Anything else is a file that appeared without going through either,
// which means it was written in another editor — by the person.
export type Writer = 'agent' | 'person';

export const writerOf = (source: string): Writer => (source === 'claude-code' ? 'agent' : 'person');

// `notes.author` is still not read. It defaults to person for the whole corpus,
// so it says nothing, and that is a different column from this one.
export const originOf = (
  declared: DocumentOrigin,
  source: string,
  // A folder the person said is somebody else's. The exception rather than the
  // rule, because most connected folders are their own material.
  inReferenceFolder = false,
): DocumentOrigin => {
  if (declared !== 'unknown') return declared;
  if (writerOf(source) === 'agent') return 'agent';
  if (inReferenceFolder) return 'external';
  return 'person';
};

// Whether memex may write there, which is about the folder and never about
// authorship. Marking a folder as your own writing does not make it writable.
export const isBorrowed = (layer: string): boolean => layer === 'external';
