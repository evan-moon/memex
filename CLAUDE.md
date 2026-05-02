# Memex

# Memex

Evan's second brain — semantic search over personal notes, powered by SQLite + vector embeddings.

## Architecture

```
apps/
├── cli/    # memex CLI (add, search, list, edit, delete, source, config)
└── mcp/    # MCP server — exposes memex tools to Claude
packages/
├── db/     # SQLite client, schema, repository (drizzle + sqlite-vec)
├── embed/  # Embedding model wrapper (@huggingface/transformers)
└── utils/  # Config loader, path helpers, formatters
```

DB lives at `~/.memex/memex.db`. Model cache at `~/.memex/models/`.

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
