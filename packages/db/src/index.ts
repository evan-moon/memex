export { openDb, EMBEDDING_DIM } from './client.ts';
export type { MemexClient } from './client.ts';
export { insertNote, saveEmbedding, searchNotes, listNotes, countNotes, getNote, getNoteByFilePath, listNotesByPathPrefix, deleteNote, updateNote, parseTags, serializeTags, findRelatedNotes } from './repository.ts';
export type { RelatedNote } from './repository.ts';
export type { Note, NewNote, NoteSource } from './schema.ts';
