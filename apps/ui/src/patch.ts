import type { NoteDetail, NotePatch } from './api.ts';

export type Form = { title: string; tags: string; layer: string; body: string };

export const parseTags = (raw: string) =>
  raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

// Only what moved. With no Save button to press, this is what stands between a
// note being open and a note being written — an editor that reported every
// field every time would rewrite a file nobody touched.
export const patchFor = (note: NoteDetail, form: Form): NotePatch => ({
  title: form.title === note.title ? undefined : form.title,
  body: form.body === note.content ? undefined : form.body,
  tags: form.tags === note.tags.join(', ') ? undefined : parseTags(form.tags),
  layer: form.layer === note.layer ? undefined : form.layer,
});

export const isDirty = (patch: NotePatch) =>
  Object.values(patch).some((value) => value !== undefined);
