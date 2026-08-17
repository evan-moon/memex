export type { RankedResult, Reranker, SearchOptions } from './note.ts';
export {
  type EditNoteRejection,
  editNote,
  isEditRejection,
  isSaveRejection,
  type RuleWriteRejection,
  removeNote,
  saveNote,
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
