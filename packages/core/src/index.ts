export type { RankedResult, Reranker, SearchOptions, SearchPage } from './note.ts';
export {
  amendmentSuggestion,
  type EditNoteRejection,
  editNote,
  isEditRejection,
  isSaveRejection,
  type RuleWriteRejection,
  removeNote,
  saveNote,
  searchPage,
  searchPageMulti,
  semanticSearch,
  semanticSearchMulti,
  type WriteActor,
} from './note.ts';
export { approveRuleNote, declineRuleNote } from './rules.ts';
export { missingSlots, SLOTS_BY_TYPE, slotTemplate } from './slots.ts';
export {
  embedNote,
  indexChunks,
  indexNoteVectors,
  type NoteVectorSource,
} from './vectors.ts';
