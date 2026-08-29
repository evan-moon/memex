export type { RankedResult, Reranker, SearchOptions, SearchPage } from './note.ts';
export {
  type EditNoteRejection,
  amendmentSuggestion,
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
export {
  embedNote,
  indexChunks,
  indexNoteVectors,
  type NoteVectorSource,
} from './vectors.ts';
