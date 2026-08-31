import type { AmendedRef, AmendKind } from './api.ts';

export const byKind = (refs: AmendedRef[], kind: AmendKind) =>
  refs.filter((ref) => ref.kind === kind);
