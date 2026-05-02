export { openDb, EMBEDDING_DIM } from './client.ts';
export type { MemexClient } from './client.ts';
export { insertNote, saveEmbedding, searchNotes, listNotes, getNote, deleteNote, updateNote } from './repository.ts';
export type { Note, NewNote, NoteSource } from './schema.ts';
