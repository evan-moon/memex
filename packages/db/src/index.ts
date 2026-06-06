export type { MemexClient } from './client.ts';
export { EMBEDDING_DIM, openDb } from './client.ts';
export type {
  Flashback,
  FlashbackOptions,
  FolderCount,
  RelatedNote,
  SimilarNote,
  TagCount,
} from './repository.ts';
export {
  countNotes,
  deleteNote,
  findFlashbacks,
  findRelatedNotes,
  findSimilarByEmbedding,
  getBacklinks,
  getNote,
  getNoteByFilePath,
  insertNote,
  listAllFolders,
  listAllTags,
  listNotes,
  listNotesByPathPrefix,
  listNotesSince,
  parseTags,
  saveEmbedding,
  searchNotes,
  serializeTags,
  syncLinks,
  updateNote,
} from './repository.ts';
export type { NewNote, Note, NoteLayer, NoteSource } from './schema.ts';
export type {
  HiddenArcOptions,
  ListSignalsOptions,
  Signal,
  SignalCandidate,
  SignalStatus,
  SignalType,
  StaleStateOptions,
  TagBurstOptions,
} from './signals.ts';
export {
  computeSignalHash,
  detectDanglingLinks,
  detectHiddenArcs,
  detectStaleState,
  detectTagBursts,
  listSignals,
  refreshSignals,
  setSignalStatus,
  upsertSignal,
} from './signals.ts';
