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
  // person: the vault owner's memory, however it was typed.
  // agent: an agent's own working notes, kept in a `memory/` directory.
  author: text('author', { enum: ['person', 'agent'] })
    .notNull()
    .default('person'),
  // When the note was actually authored (parsed from frontmatter/title date),
  // as opposed to createdAt which is the import timestamp. Nullable; temporal
  // reasoning falls back to createdAt when absent.
  authoredAt: integer('authored_at'),
  // Only meaningful on a `rule` note. What the agent writes as a rule becomes
  // its own next input, so it lands provisional and is not injected until a
  // person approves it. Null on every other layer.
  ruleStatus: text('rule_status', { enum: ['provisional', 'canonical'] }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Note = typeof notes.$inferSelect;
export type NoteSource = Note['source'];
export type NoteLayer = Note['layer'];
export type NoteAuthor = Note['author'];
export type RuleStatus = NonNullable<Note['ruleStatus']>;
export type NewNote = Omit<typeof notes.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;
