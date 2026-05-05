#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdirSync } from 'node:fs';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { expandPath, loadConfig, CONFIG_DIR, MODEL_CACHE_DIR } from './config.ts';
import { registerSaveNote } from './tools/save-note.ts';
import { registerSearchNotes } from './tools/search-notes.ts';
import { registerListNotes } from './tools/list-notes.ts';
import { registerGetNote } from './tools/get-note.ts';
import { registerDeleteNote } from './tools/delete-note.ts';
import { registerUpdateNote } from './tools/update-note.ts';
import { registerListTags } from './tools/list-tags.ts';
import { registerListFolders } from './tools/list-folders.ts';

const config = loadConfig();
const vaultPath = expandPath(config.vault_path);

mkdirSync(MODEL_CACHE_DIR, { recursive: true });

const client = openDb(CONFIG_DIR);
const embedder = await createEmbedder(MODEL_CACHE_DIR);

const server = new McpServer({ name: 'memex', version: '0.1.0' }, {
  instructions: `
You are connected to the user's second brain (memex). Follow these rules at all times:

## SEARCH

Before answering any question that could relate to past conversations, people, projects, or decisions, call search_notes first. Always search first, then answer — even if the connection seems loose.

When the user asks about a specific time period ("last week", "in April", "since the sprint"), pass date_from and/or date_to to search_notes. Use ISO 8601 format (e.g. "2026-04-01").

## SAVE

At the end of any conversation that contains valuable context, call save_note without asking the user. Save when:
- A technical decision was made and the rationale matters
- Key points from a conversation with a specific person (1-on-1, coffee chat, interview, etc.)
- A new insight or concept worth recalling later
- Project context: background, constraints, or goals
- The user explicitly says "remember this" or "save this"

Before saving, call list_tags and list_folders to see what taxonomy already exists — pick from existing tags and folders rather than inventing new ones.

When a note refers to people, projects, or concepts that likely have their own notes, use [[Title]] wiki-link syntax in the content to create backlinks (e.g. "discussed this with [[Tom]]" or "builds on [[Auth Architecture Decision]]").

If save_note responds with a ⚠️ similar notes warning, do not save a new note. Switch to update_note on the most relevant listed note instead.

## UPDATE

Prefer update_note over creating a duplicate when new content belongs with an existing note. If unsure, search first — then update or save.

## FOLDER CONVENTION

conversations/<name> · decisions/<project> · learning/<topic> · ideas/

## TAGS

Always include tags when saving or updating a note. Extract 3–7 semantic tags covering technologies, people, topics, and concepts — independent of the folder. Tags are the primary cross-category relationship mechanism (e.g. a "typescript" tag connects a conversation with Alice to a decision in decisions/memex).
`.trim(),
});

registerSaveNote(server, client, embedder, vaultPath);
registerSearchNotes(server, client, embedder);
registerListNotes(server, client);
registerGetNote(server, client);
registerDeleteNote(server, client);
registerUpdateNote(server, client, embedder, vaultPath);
registerListTags(server, client);
registerListFolders(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
