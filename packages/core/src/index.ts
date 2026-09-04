export type { RankedResult, Reranker, SearchOptions, SearchPage } from './note.ts';
export {
  amendmentSuggestion,
  confirmNote,
  type EditNoteRejection,
  editNote,
  isEditRejection,
  isSaveRejection,
  persistNoteFile,
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
export type { StructuredLayer } from './slots.ts';
export {
  missingSlots,
  SLOTS_BY_LAYER,
  SLOTS_BY_TYPE,
  slotsDropped,
  slotsFor,
  slotTemplate,
} from './slots.ts';
export {
  embedNote,
  indexChunks,
  indexNoteVectors,
  type NoteVectorSource,
} from './vectors.ts';
