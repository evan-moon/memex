export type { CardField, CardQuality, NoteCard } from './card.ts';
export { extractCard } from './card.ts';
export {
  type ChangeKind,
  changeHead,
  hasChangeFrom,
  recordNoteChange,
} from './changes.ts';
export type { ChatSession, ChatTurn } from './chat.ts';
export {
  deleteSession,
  listSessions,
  recordTurn,
  restateTurn,
  sessionExists,
  sessionTurns,
  startSession,
} from './chat.ts';
export {
  getNoteShape,
  indexTypeNoteIds,
  type NoteShape,
  type NoteShapeInput,
  type NoteShapeKind,
  overClaimCeiling,
  setNoteShape,
  shapedNoteIds,
} from './claims.ts';
export type {
  ClassifyInput,
  ClassifyMethod,
  Confidence,
  NoteArea,
  NoteType,
  NoteTypeLabel,
} from './classify.ts';
export { classifyNote, headingsOf, isNoteType, NOTE_TYPES } from './classify.ts';
export type { MemexClient } from './client.ts';
export { EMBEDDING_DIM, openDb } from './client.ts';
export {
  classifyDangling,
  type DanglingKind,
  type DanglingLink,
  danglingLinks,
  dismissDanglingFor,
  dismissedDanglingNoteIds,
  restoreDanglingFor,
} from './dangling.ts';
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
export type { NoteFacets } from './facets.ts';
export {
  dropNoteFacets,
  getNoteCard,
  getNoteTypeLabel,
  resyncNoteFacets,
  syncNoteFacets,
} from './facets.ts';
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
export {
  getNoteInvalidations,
  invalidationsFor,
  setNoteInvalidations,
} from './invalidations.ts';
export {
  findUnresolvedLinks,
  linkTargets,
  resolveLinkTargets,
  resyncLinkIndexes,
  syncLinks,
  unresolvedLinksByNote,
} from './link-index.ts';
export { syncExternalLayer } from './ownership.ts';
export {
  type PresentationSurface,
  presentationsFor,
  receptionCounts,
  recordPresentation,
  type SignalPresentation,
  type SignalReception,
  wasIgnored,
} from './presentations.ts';
export type {
  PredicateStatus,
  RegisterAuthor,
  RegisterHead,
  RegisterHistoryEntry,
  RegisterScope,
  RegisterSubject,
  RegisterTip,
  SetRegisterInput,
  SetRegisterRejection,
  SetRegisterResult,
} from './register.ts';
export {
  isValidScope,
  listRegisterSubjects,
  matchRegisterSubjects,
  readRegister,
  registerHistory,
  setRegister,
} from './register.ts';
export type {
  AmendKind,
  Amendment,
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
  getAmendments,
  getAmendmentsFor,
  getBacklinks,
  getNote,
  getNoteByFilePath,
  insertNote,
  kindOfEdge,
  linkAmendment,
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
  updateNote,
} from './repository.ts';
export {
  countRetrievals,
  logRetrieval,
  type RetrievalCount,
  type RetrievalCountOptions,
  type RetrievalEntry,
  type RetrievalInitiator,
  type RetrievalSurface,
  retrievalCounts,
} from './retrieval-log.ts';
export {
  approveRule,
  countProvisionalRules,
  declineRule,
  listRules,
} from './rules.ts';
export type { NewNote, Note, NoteAuthor, NoteLayer, NoteSource, RuleStatus } from './schema.ts';
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
  detectDanglingLinksFor,
  detectHiddenArcs,
  detectStaleState,
  detectTagBursts,
  findBestProactiveSignal,
  getSignal,
  getSignalByHash,
  listSignals,
  proactiveSignalFor,
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
