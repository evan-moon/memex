import type { NoteDetail } from './api.ts';
import type { Strings } from './i18n.ts';

export type Draft = {
  heading: string;
  explain?: string;
  title: string;
  body: string;
  layer: string;
  fixedLayer?: boolean;
  amends?: number;
  submitLabel: string;
};

// `quoted` is the paragraph the reader was looking at when they said it was
// wrong. Carrying it in means the correction says what it corrects, instead of
// pointing at a note and leaving the reader to say it again.
export const correctionDraft = (note: NoteDetail, t: Strings, quoted?: string): Draft | null =>
  note.amendment
    ? {
        heading: t.edit.correctionTitle,
        explain: t.edit.correctionWhy,
        title: note.amendment.title,
        body: quoted
          ? `${note.amendment.link}\n\n> ${quoted.trim()}\n\n`
          : `${note.amendment.link}\n\n`,
        layer: note.amendment.layer,
        fixedLayer: true,
        amends: note.amendment.amends,
        submitLabel: t.edit.createCorrection,
      }
    : null;

export const missingNoteDraft = (title: string, t: Strings): Draft => ({
  heading: t.edit.missingTitle,
  explain: t.edit.missingWhy,
  title,
  body: '',
  layer: 'past',
  submitLabel: t.edit.createNote,
});
