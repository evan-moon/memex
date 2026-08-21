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
  buildEvidenceBundle,
  checkInferenceStale,
  getInference,
  listInferences,
  mintInference,
  noteContentHash,
  refreshInferenceStaleness,
  setInferenceStatus,
} from './inferences.ts';
export type {
  EmbeddedChunk,
  Flashback,
  FlashbackOptions,
  FolderCount,
  RelatedNote,
  SearchResult,
  SimilarNote,
  TagCount,
} from './repository.ts';
export {
  countChunks,
  countNotes,
  deleteNote,
  deleteNoteChunks,
  findFlashbacks,
  findRelatedNotes,
  findSimilarByEmbedding,
  findUnresolvedLinks,
  unresolvedLinksByNote,
  getAmendments,
  getAmendmentsFor,
  getBacklinks,
  getNote,
  getNoteByFilePath,
  insertNote,
  linkAmendment,
  linkTargets,
  listAllFolders,
  listAllTags,
  listNotes,
  listNotesByPathPrefix,
  listNotesSince,
  parseTags,
  RRF_K,
  replaceNoteChunks,
  saveEmbedding,
  searchNotes,
  serializeTags,
  syncLinks,
  updateNote,
} from './repository.ts';
export type { NewNote, Note, NoteAuthor, NoteLayer, NoteSource } from './schema.ts';
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
