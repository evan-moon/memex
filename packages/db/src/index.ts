export type { MemexClient } from './client.ts';
export { EMBEDDING_DIM, openDb } from './client.ts';
export { parseAuthoredAt } from './dates.ts';
export {
  type EmbeddingModelStatus,
  ensureEmbeddingModel,
  markReembedded,
  needsReembed,
} from './index-meta.ts';
export type {
  EvidenceEdge,
  EvidenceInput,
  EvidenceRole,
  Inference,
  InferenceStatus,
  MintInferenceInput,
} from './inferences.ts';
export {
  checkInferenceStale,
  getInference,
  listInferences,
  mintInference,
  noteContentHash,
  refreshInferenceStaleness,
  setInferenceStatus,
} from './inferences.ts';
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
  findBestProactiveSignal,
  getSignal,
  listSignals,
  refreshSignals,
  setSignalStatus,
  upsertSignal,
} from './signals.ts';
export {
  type CorpusStats,
  type CountByKey,
  type FlashbackStats,
  getCorpusStats,
  getFlashbackStats,
  type ResurfacedNote,
} from './stats.ts';
