export { openDb, EMBEDDING_DIM } from './client.ts';
export type { MemexClient } from './client.ts';
export { insertNote, saveEmbedding, searchNotes, listNotes, countNotes, getNote, getNoteByFilePath, listNotesByPathPrefix, deleteNote, updateNote, parseTags, serializeTags, findRelatedNotes, findSimilarByEmbedding } from './repository.ts';
export type { RelatedNote, SimilarNote } from './repository.ts';
export type { Note, NewNote, NoteSource } from './schema.ts';
