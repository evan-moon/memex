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

export const correctionDraft = (note: NoteDetail, t: Strings): Draft | null =>
  note.amendment
    ? {
        heading: t.edit.correctionTitle,
        explain: t.edit.correctionWhy,
        title: note.amendment.title,
        body: `${note.amendment.link}\n\n`,
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
