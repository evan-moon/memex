# Memex

# Memex

Evan's second brain — semantic search over personal notes, powered by SQLite + vector embeddings.

## Architecture

```
apps/
├── cli/    # memex CLI — the safety net (see surface policy below)
└── mcp/    # MCP server — exposes memex tools to Claude
packages/
├── core/   # Note service shared by cli/mcp (save/edit/search/delete)
├── db/     # SQLite client, schema, repository (drizzle + sqlite-vec)
├── embed/  # Embedding model wrapper (@huggingface/transformers)
├── rerank/ # Cross-encoder reranker, opt-in via MEMEX_RERANK=1
└── utils/  # Config loader, path helpers, formatters, note chunker
```

DB lives at `~/.memex/memex.db`. Model cache at `~/.memex/models/`.

## Surface policy

**MCP-first. The CLI is the safety net.**

Users interact with memex through the MCP server (Claude Desktop / Claude Code / Cursor): search and save happen in conversation, not at a prompt. The CLI exists only for what the MCP path cannot or must not do. New features default to MCP-only; a CLI command is added only when it fits one of these groups (mirrored in `memex --help`):

- **Setup**: `mcp`, `recall`, `config`
- **Capture** (manual entry + AI-mistake correction, and the user-only writes the agent is forbidden from): `add`, `edit`, `delete`, `capture-commit`
- **Vault** (external sources & embeddings): `source`, `index`, `reembed`
- **Verify** (read-only — inspect what landed in the DB, nothing more): `search`, `list`, `show`, `related`, `tags`
- **Insight engine** (deterministic signal/inference operations): `signals` (+ `signals mint`), `inferences`, `digest`, `layer`
- **Maintenance** (measurement & scheduling): `stats` (+ `stats eval`), `schedule`
- **Read** (the one screen): `ui` — browse by topic and see what a later note corrected. Signals appear here as annotations in context, never as a queue to work through

Do NOT extend beyond these groups. Prefer a subcommand of an existing command over a new top-level command (`signals mint`, `stats eval`). The MCP tool surface is deliberately small (13 tools) — duplicate read paths give the model more ways to pick wrong; consolidate before enumerating.

## Memex MCP Usage

When `mcp__memex__*` tools are available, follow these rules.

### Search — at the start of a conversation (always)
If the topic could relate to past conversations, people, projects, or decisions, call `search_notes` before answering. No results is fine — still search.

### Save — at the end of a conversation (use judgment)
Without asking the user, call `save_note` whenever any of these apply:
- A technical decision was made and the rationale matters
- Key points from a conversation with a specific person (1-on-1, coffee chat, interview, etc.)
- A new insight or concept worth recalling later
- Project context: background, constraints, or goals
- The user explicitly says "remember this", "save this", etc.

Prefer `update_note` over creating a duplicate when new content belongs with an existing note.

Folder convention — **subject first, never note type.** What kind of note it is lives in `layer` (past/state/rule) and `tags`, so a decision and a work log about the same project land in the same folder:

- `projects/<name>` — active work (opula, firma, memex, herald, skope, agent-team)
- `work/people/<name>` · `work/toss` · `work/interviews` · `work/quotalab` — colleagues, org history, hiring
- `investing/` · `writing/` · `learning/<topic>` · `coding/` · `personal/`

Call `list_folders` before saving and reuse an existing folder. Do NOT create `decisions/`, `dev/`, `conversations/`, `ideas/`, or `drafts/` — those split one subject across parallel trees.

Correction convention — a `past` note can never be edited, so corrections are new notes. Always pass `amends: <id>` when saving one: search marks the older note superseded and points at the newest correction. Without it the correction is invisible to what it corrects, and search keeps returning the claim you already fixed.

Link convention — notes are Obsidian files, so `[[Exact Note Title]]` is the only form that links. Search first and copy the title verbatim; `[[Title|display text]]` when the sentence needs other wording. Never `[[Title]](#1234)`, `[[1234]]`, `[label](path/note.md)`, or `[[some-memory-key]]` — those render as dead text. Reference an id in prose as plain `#1234`. `save_note`/`update_note` report links that resolve to nothing.
