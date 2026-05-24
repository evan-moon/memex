export { openDb, EMBEDDING_DIM } from './client.ts';
export type { MemexClient } from './client.ts';
export { insertNote, saveEmbedding, searchNotes, listNotes, countNotes, getNote, getNoteByFilePath, listNotesByPathPrefix, deleteNote, updateNote, parseTags, serializeTags, findRelatedNotes, findSimilarByEmbedding, listAllTags, listAllFolders, syncLinks, getBacklinks, listNotesSince } from './repository.ts';
export type { RelatedNote, SimilarNote, TagCount, FolderCount } from './repository.ts';
export type { Note, NewNote, NoteSource, NoteLayer } from './schema.ts';
