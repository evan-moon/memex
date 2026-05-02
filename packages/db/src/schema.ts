import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  filePath: text('file_path').notNull().unique(),
  source: text('source', { enum: ['manual', 'herald', 'claude-code'] })
    .notNull()
    .default('manual'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Note = typeof notes.$inferSelect;
export type NoteSource = Note['source'];
export type NewNote = Omit<typeof notes.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;
