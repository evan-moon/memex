import type { AuthoringDraft } from './api.ts';
import { withTitle } from './heading.ts';

export type GeneratedDraft = { markdown: string; layer: 'past' | 'state' };

export const generatedDraft = (draft: AuthoringDraft): GeneratedDraft => ({
  markdown: withTitle(draft.title, draft.body),
  layer: draft.layer,
});
