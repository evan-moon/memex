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
└── utils/  # Config loader, path helpers, formatters
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

Folder convention: `conversations/<name>`, `decisions/<project>`, `learning/<topic>`, `ideas/`
