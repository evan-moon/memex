import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  filePath: text('file_path').notNull().unique(),
  category: text('category'),
  tags: text('tags').notNull().default('[]'),
  source: text('source', { enum: ['manual', 'herald', 'claude-code', 'index', 'git'] })
    .notNull()
    .default('manual'),
  layer: text('layer', { enum: ['past', 'state', 'rule'] })
    .notNull()
    .default('past'),
  // When the note was actually authored (parsed from frontmatter/title date),
  // as opposed to createdAt which is the import timestamp. Nullable; temporal
  // reasoning falls back to createdAt when absent.
  authoredAt: integer('authored_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Note = typeof notes.$inferSelect;
export type NoteSource = Note['source'];
export type NoteLayer = Note['layer'];
export type NewNote = Omit<typeof notes.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;
