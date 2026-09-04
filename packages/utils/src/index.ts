export type { ChunkOptions, NoteChunk } from './chunk.ts';
export { buildChunkText, chunkNote, estimateTokens } from './chunk.ts';
export type { MemexConfig, MemexSource } from './config.ts';
export {
  CONFIG_DIR,
  expandPath,
  inVault,
  loadConfig,
  MODEL_CACHE_DIR,
  saveConfig,
} from './config.ts';
export { parseConfirmedAt, writeConfirmedAt } from './confirmed.ts';
export { findNearest, withinEditDistance } from './distance.ts';
export { EMBEDDING_DIM } from './embedding.ts';
export { parseDerivesFrom, writeDerivesFrom } from './evidence.ts';
export { filenameKey, sanitizeFilename, sanitizeFolder, titleKey } from './filename.ts';
export type { NoteAuthor } from './format.ts';
export {
  authorOfPath,
  buildEmbeddingText,
  extractCategory,
  formatDate,
  noteProse,
  stripFrontmatter,
} from './format.ts';
export { parseInvalidates, writeInvalidates } from './invalidates.ts';
export type { RuleScope } from './scope.ts';
export {
  describeRuleScope,
  formatRuleScope,
  GLOBAL_SCOPE,
  parseRuleScope,
  parseScopeLine,
  writeScopeLine,
} from './scope.ts';
export type { CollapsedSeries, SeriesMember } from './series.ts';
export { collapseSeries, isSameSeries, seriesKey, seriesLabel } from './series.ts';
export type { TagVariant } from './tags.ts';
export { findTagVariants, rewriteTags, tagKey } from './tags.ts';
export { yamlScalar } from './yaml.ts';
