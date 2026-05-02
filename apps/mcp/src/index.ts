#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdirSync } from 'node:fs';
import { openDb } from '@memex/db';
import { createEmbedder } from '@memex/embed';
import { expandPath, loadConfig, MODEL_CACHE_DIR } from './config.ts';
import { registerSaveNote } from './tools/save-note.ts';
import { registerSearchNotes } from './tools/search-notes.ts';
import { registerListNotes } from './tools/list-notes.ts';
import { registerGetNote } from './tools/get-note.ts';
import { registerDeleteNote } from './tools/delete-note.ts';
import { registerUpdateNote } from './tools/update-note.ts';

const config = loadConfig();
const vaultPath = expandPath(config.vault_path);

mkdirSync(MODEL_CACHE_DIR, { recursive: true });

const client = openDb(vaultPath);
const embedder = await createEmbedder(MODEL_CACHE_DIR);

const server = new McpServer({ name: 'memex', version: '0.1.0' });

registerSaveNote(server, client, embedder, vaultPath);
registerSearchNotes(server, client, embedder);
registerListNotes(server, client);
registerGetNote(server, client);
registerDeleteNote(server, client);
registerUpdateNote(server, client, embedder);

const transport = new StdioServerTransport();
await server.connect(transport);
