#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { ensureEmbeddingModel, listInferences, listSignals, openDb } from '@memex/db';
import { createEmbedder, EMBEDDING_MODEL_ID } from '@memex/embed';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CONFIG_DIR, expandPath, loadConfig, MODEL_CACHE_DIR } from './config.ts';
import { buildRuleInstructions } from './services/rules.ts';
import { registerDeleteNote } from './tools/delete-note.ts';
import { registerGetNote } from './tools/get-note.ts';
import { registerInferences } from './tools/inferences.ts';
import { registerListFolders } from './tools/list-folders.ts';
import { registerListNotes } from './tools/list-notes.ts';
import { registerListTags } from './tools/list-tags.ts';
import { registerSaveNote } from './tools/save-note.ts';
import { registerSearchNotes } from './tools/search-notes.ts';
import { registerSignals } from './tools/signals.ts';
import { registerUpdateNote } from './tools/update-note.ts';

declare const __MEMEX_VERSION__: string;
const VERSION = (() => {
  try {
    return __MEMEX_VERSION__;
  } catch {
    return '0.0.0-dev';
  }
})();

const config = loadConfig();
const vaultPath = expandPath(config.vault_path);

mkdirSync(MODEL_CACHE_DIR, { recursive: true });

const client = openDb(CONFIG_DIR);
if (ensureEmbeddingModel(client, EMBEDDING_MODEL_ID) === 'model-changed') {
  console.error(
    '[memex] embedding model changed — stale vectors cleared. Semantic search is keyword-only until `memex reembed` is run.',
  );
}
const embedder = await createEmbedder(MODEL_CACHE_DIR);

const baseInstructions = `
You are connected to the user's second brain (memex). Follow these rules at all times:

## SEARCH

Before answering any question that could relate to past conversations, people, projects, or decisions, call search_notes first. Always search first, then answer — even if the connection seems loose. Never say "I don't have any record of that" without having searched.

Recognizing the cue — the signals are linguistic. The user writes AS IF you already know something not visible in this conversation:
- possessives without context: "my dissertation", "our approach"
- definite articles assuming shared reference: "the script", "that strategy"
- past-tense verbs about prior exchanges: "you recommended", "we decided"
- direct asks: "do you remember", "continue where we left off"

Boundary cases:
- "How's my python project coming along?" → search "python project"; the possessive assumes you know which one.
- "What did we decide about that thing?" → no content words to search on; ask which thing.
- "What's the capital of France?" → no past-reference signal; just answer.

Query construction: content nouns (the topic, the proper noun, the project name), not meta-words like "discussed" or "yesterday" that describe the act of talking. A few distinctive words beat a sentence. If the user pastes a long passage, extract a few identifying keywords — never put the passage itself in the query.

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

## COMPANION TOOLS

memex is the memory layer of a small local-first stack. Other personal-data tools may be connected in the same session — e.g. firma (the user's money) or skope (their news). They are sensors; you are the memory they write to. memex never calls them and they never call memex — *you* are the only bridge, and memex works fully on its own. This just lets the stack compound when they happen to be present.

- **Absorb their decisions, not their data.** When a session with another tool produces something *durable* — an investment thesis, a "hold through the volatility" call and its rationale, why the user started following a story skope surfaced — save it here with save_note, as you would any decision, without asking. Skip raw numbers and transient readouts: those belong to the tool that owns them and go stale. Tag with the source (e.g. \`firma\`, \`skope\`) so cross-tool memory stays findable.
  BAD (transient readout): "TSLA closed at $412, portfolio +2.1% today."
  GOOD (durable decision): "Decided to hold TSLA through earnings volatility — thesis: FSD licensing optionality. Revisit if auto margin drops below 15%."
- **Recall across tools.** When the user is working in one of these tools, a past decision from another may matter — surface a memex note "decided to trim TSLA last month" when skope raises a TSLA story, or "why I hold this" when firma flags it. Search first, then offer it.

## FOLDER CONVENTION

Subject first, never note type — what kind of note it is already lives in \`layer\` and \`tags\`, so a decision and a work log about the same project belong in the same folder.

projects/<name> · work/people/<name> · work/toss · work/interviews · investing/ · writing/ · learning/<topic> · coding/ · personal/

Call list_folders before saving and reuse an existing folder. Never create decisions/, dev/, conversations/, ideas/ or drafts/ — they split one subject across parallel trees.

## LINKS

Notes are Obsidian files, so \`[[Exact Note Title]]\` is the only link form that works. Search first and copy the title verbatim — a title you guessed at is a dead link. Use \`[[Title|display text]]\` when the sentence needs different wording.

Never write: \`[[Title]](#1234)\` (the tail renders as literal text), \`[[1234]]\` (ids are not titles), \`[label](path/note.md)\` (breaks the moment a note moves), or \`[[some-memory-key]]\` (Claude's own memory files are not notes in this vault). To point at a note by id in prose, write #1234 as plain text.

save_note and update_note report any link that resolves to nothing — fix those before moving on.

## TAGS

Always include tags when saving or updating a note. Extract 3–7 semantic tags covering technologies, people, topics, and concepts — independent of the folder. Tags are the primary cross-category relationship mechanism (e.g. a "typescript" tag connects a conversation with Alice to a decision in decisions/memex).

## INSIGHTS (signals & inferences)

The user just writes notes — they will rarely ask "find connections". Noticing patterns is YOUR job, not theirs. Surface them proactively, like Flashback does.

- **PROACTIVITY:** When save_note or update_note responds with a 💡 Proactive Signal, weave a *gentle* one-line offer into your reply — say what you noticed in plain language (no jargon like "hidden_arc") and ask if they want you to capture it. Example: "By the way, this is the 5th note you've written circling X over ~2 years and they're not connected — want me to pull them into one insight?" Then mint only if they say yes.
- **RESTRAINT (important):** Only nudge when a 💡 hint is actually present in the tool response. Never fish for patterns on a plain message, make at most ONE short offer, don't let it derail what the user was doing, and never re-pitch a suggestion they already declined (dismissed signals don't reappear). Over-eager nudging gets the whole feature turned off.
- **SIGNALS:** You may also call get_signals when the user reflects, plans, or asks what to write next.
- **INFERENCES:** Inferences are HYPOTHESES, not facts. When you use one (get_inference / list_inferences), cite it as a hypothesis with its confidence and evidence note ids — never present it as something the user knows.
- **MINTING:** Call mint_inference only after the user agrees to save a discovery (confirmed: true). Present the hypothesis first; never auto-mint.
`.trim();

const injectRules = process.env.MEMEX_INJECT_RULES !== '0';
const maxChars = process.env.MEMEX_RULES_MAX_CHARS
  ? Number(process.env.MEMEX_RULES_MAX_CHARS)
  : undefined;
const ruleSection = injectRules ? buildRuleInstructions(client, { maxChars }) : '';

// Nudge only (a COUNT, never inference content): inferences are pull-only so
// they never silently shape answers as if they were facts.
const newSignals = listSignals(client, { status: 'new' }).length;
const staleInferences = listInferences(client, { status: 'stale' }).length;
const nudgeParts = [
  newSignals > 0 ? `${newSignals} new signal(s) to triage (get_signals)` : '',
  staleInferences > 0 ? `${staleInferences} stale inference(s) to re-verify` : '',
].filter(Boolean);
// Static startup snapshot (MCP instructions are fixed at construct time); call
// get_signals / list_inferences for live state.
const nudge =
  nudgeParts.length > 0 ? `\n\n## STATUS (at startup)\n\n${nudgeParts.join('; ')}.` : '';

const instructions =
  (ruleSection ? `${baseInstructions}\n\n${ruleSection}` : baseInstructions) + nudge;

const server = new McpServer({ name: 'memex', version: VERSION }, { instructions });

registerSaveNote(server, client, embedder, vaultPath);
registerSearchNotes(server, client, embedder);
registerListNotes(server, client);
registerGetNote(server, client);
registerDeleteNote(server, client);
registerUpdateNote(server, client, embedder, vaultPath);
registerListTags(server, client);
registerListFolders(server, client);
registerSignals(server, client);
registerInferences(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
