export type { MemexClient } from './client.ts';
export { EMBEDDING_DIM, openDb } from './client.ts';
export { parseAuthoredAt } from './dates.ts';
export type { Evidence, EvidenceEdge as NoteEvidenceEdge, Staleness } from './evidence.ts';
export {
  bodyHash,
  evidenceFor,
  evidenceStaleness,
  getNoteEvidence,
  isStale,
  notesDeclaringEvidence,
  setNoteEvidence,
  syncNoteEvidence,
} from './evidence.ts';
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
  InferenceRef,
  InferenceStatus,
  MintInferenceInput,
} from './inferences.ts';
export {
  buildEvidenceBundle,
  checkInferenceStale,
  getInference,
  inferencesCiting,
  inferencesOverNotes,
  listInferences,
  mintInference,
  noteContentHash,
  refreshInferenceStaleness,
  restampInference,
  rewriteInference,
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
  unresolvedLinksByNote,
  updateNote,
} from './repository.ts';
export {
  countRetrievals,
  logRetrieval,
  type RetrievalCount,
  type RetrievalEntry,
  type RetrievalSurface,
  retrievalCounts,
} from './retrieval-log.ts';
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
  detectConflictPairs,
  detectDanglingLinks,
  detectHiddenArcs,
  detectStaleState,
  detectTagBursts,
  findBestProactiveSignal,
  getSignal,
  getSignalByHash,
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
