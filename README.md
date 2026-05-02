# memex

[![npm](https://img.shields.io/npm/v/@evan-moon/memex?color=black&label=npm)](https://www.npmjs.com/package/@evan-moon/memex)
[![license](https://img.shields.io/github/license/evan-moon/memex?color=black)](./LICENSE)
[![node](https://img.shields.io/node/v/@evan-moon/memex?color=black)](https://nodejs.org)

> Claude has no memory between sessions. memex gives it one.

Local-first second brain that connects to Claude via MCP. Notes are stored as plain Markdown and indexed with a local ML model — fully offline, no API keys, nothing leaves your machine.

---

## The problem

Every time you close Claude, it forgets. Your decisions, your context, your thinking — gone. You end up re-explaining the same background over and over.

```
You:    What did we decide about the auth approach last sprint?
Claude: I don't have context from previous conversations...
```

## The fix

```
You:    What did we decide about the auth approach last sprint?

Claude: [memex · search_notes · "auth approach decision"]

        Found 2 notes:

        Auth Architecture Decision  Apr 14  #auth #backend
        ─────────────────────────────────────────────────────
        Chose JWT + refresh tokens over sessions. Rationale:
        stateless design fits horizontal scaling plan.

        Based on your April 14th note: you went with JWT +
        refresh tokens. Tom also flagged keeping auth decoupled
        from payment logic — separate bounded contexts.
```

Claude searches your notes before answering and saves insights at the end of every conversation — automatically, without being asked.

---

## Install

```bash
npm install -g @evan-moon/memex
```

Connect to Claude Code:

```bash
memex mcp install
```

That's it. On first run, the embedding model (~450MB) downloads once to `~/.memex/models/`.

---

## Features

- **Semantic search** — finds notes by meaning, not just keywords. Multilingual (Korean + English), runs fully offline via [`multilingual-e5-base`](https://huggingface.co/intfloat/multilingual-e5-base)
- **Hybrid retrieval** — vector search + BM25 full-text + tag matching, fused via Reciprocal Rank Fusion
- **MCP server** — Claude searches and saves automatically. No extra CLAUDE.md setup needed
- **CLI** — add, search, tag, browse, and index notes from the terminal
- **Obsidian-compatible** — notes saved as `.md` files; works alongside existing vaults
- **Local DB** — SQLite + [`sqlite-vec`](https://github.com/asg017/sqlite-vec) at `~/.memex/memex.db`

---

## CLI

```bash
# Add notes
memex add                                    # interactive prompt
memex add --title "Note title" --content "..."
memex add --title "Note title" --file ./note.md
memex add --title "Note title" --content "..." --folder conversations/tom
memex add --title "Note title" --content "..." -T typescript -T architecture

# Search
memex search "semantic search query"         # multilingual
memex search "지식 관리" --limit 10
memex search "query" --tag typescript        # filter by tag

# Browse
memex list                                   # recent 10 notes
memex list --limit 20
memex show <id>
memex tags                                   # all tags with counts
memex related <id>                           # semantically related notes

# Edit / delete
memex edit <id>
memex delete <id>
memex delete --yes <id>                      # skip confirmation

# Index external directories
memex source add ~/Documents/My\ Notes       # register a vault
memex source list
memex source remove ~/Documents/My\ Notes
memex index                                  # scan vault + all sources
memex index --force                          # re-index everything
memex reembed                                # re-embed with current model

# Config
memex config show
memex config set vault-path ~/Documents/Second\ Brain

# MCP
memex mcp install                            # register with Claude Code
memex mcp path                               # print MCP binary path
```

---

## MCP server

### Claude Code

```bash
memex mcp install
```

Or manually:

```bash
claude mcp add memex -- node "$(memex mcp path)"
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memex": {
      "command": "node",
      "args": ["<path from `memex mcp path`>"]
    }
  }
}
```

### Available tools

| Tool | Description |
|------|-------------|
| `save_note` | Save a note with title, content, folder, and tags |
| `search_notes` | Semantic search across all notes |
| `list_notes` | List recent notes |
| `get_note` | Get full content of a note by ID |
| `update_note` | Update title or content of an existing note |
| `delete_note` | Delete a note by ID |

---

## Configuration

Config lives at `~/.memex/config.json`.

| Key | Default | Description |
|-----|---------|-------------|
| `vault_path` | `~/Documents/Second Brain` | Directory where `.md` files are saved |
| `sources` | `[]` | Additional directories to index (e.g. existing Obsidian vaults) |
| `aliases` | `{}` | Search alias map, e.g. `{ "js": ["javascript", "자바스크립트"] }` |

```bash
memex config set vault-path ~/my-vault
```

---

## Architecture

```
~/.memex/
  config.json       — vault path, sources, and aliases
  memex.db          — SQLite DB (notes + vec embeddings + FTS5 index)
  models/           — cached embedding model

<vault>/
  *.md              — notes (Obsidian-compatible)
```

| Package | Role |
|---------|------|
| `@memex/db` | SQLite schema, drizzle queries, sqlite-vec + FTS5 integration |
| `@memex/embed` | Local embedder via @huggingface/transformers |
| `@memex/utils` | Config, path helpers, shared utilities |
| `@memex/mcp` | MCP server (bundled into CLI dist) |

---

## Part of a personal AI stack

memex is the memory layer of the [Herald](https://ai-herald.vercel.app) ambient voice assistant stack.

**Herald + memex + [Firma](https://github.com/evan-moon/firma)**
— ambient voice, persistent memory, and financial intelligence.

---

## License

MIT
