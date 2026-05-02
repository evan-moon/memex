# memex

[![npm](https://img.shields.io/npm/v/@evan-moon/memex?color=black&label=npm)](https://www.npmjs.com/package/@evan-moon/memex)
[![license](https://img.shields.io/github/license/evan-moon/memex?color=black)](./LICENSE)
[![node](https://img.shields.io/node/v/@evan-moon/memex?color=black)](https://nodejs.org)

Local-first second brain with semantic search. Stores notes as Markdown files and indexes them with a local ML model — no cloud, no API keys.

Works as an **MCP server** for Claude Code and Claude Desktop, and as a standalone **CLI**.

---

## Features

- **Semantic search** — multilingual embeddings via [`paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) (Korean + English, runs fully offline)
- **Obsidian-compatible** — notes saved as `.md` files in your vault directory
- **MCP server** — Claude can save and search your second brain mid-conversation, with built-in instructions for proactive search and save behavior
- **CLI** — add, search, list, show, edit, delete, tag, and index notes from the terminal
- **Local DB** — SQLite + [`sqlite-vec`](https://github.com/asg017/sqlite-vec) stored at `~/.memex/memex.db`

---

## Install

```bash
npm install -g @evan-moon/memex
```

On first run the embedding model (~120MB) is downloaded once to `~/.memex/models/`.

---

## CLI

```bash
# Add notes
memex add                                   # interactive prompt
memex add --title "Note title" --content "..."
memex add --title "Note title" --file ./note.md
memex add --title "Note title" --content "..." --folder "projects/memex"
memex add --title "Note title" --content "..." -T typescript -T architecture

# Browse
memex list                                  # recent 10 notes
memex list --limit 20
memex show <id>

# Search
memex search "semantic search query"        # multilingual
memex search "지식 관리" --limit 10
memex search "query" --tag typescript       # filter by tag

# Discover
memex tags                                  # all tags with note counts
memex related <id>                          # semantically related notes

# Edit / delete
memex edit <id>
memex delete <id>
memex delete --yes <id>                     # skip confirmation

# Index external directories
memex source add ~/Documents/My\ Notes      # register a directory
memex source list
memex source remove ~/Documents/My\ Notes
memex index                                 # scan vault + all sources
memex index --force                         # re-index everything
memex reembed                               # re-embed all notes with current model

# Config
memex config show
memex config set vault-path ~/Documents/Second\ Brain

# MCP
memex mcp install                           # register with Claude Code
memex mcp path                              # print MCP binary path
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
| `save_note` | Save a note (title + markdown content + optional folder) |
| `search_notes` | Semantic search across all notes |
| `list_notes` | List recent notes |
| `get_note` | Get full content of a note by ID |
| `update_note` | Update title or content of an existing note |
| `delete_note` | Delete a note by ID |

The MCP server includes built-in instructions that tell Claude to search before answering and save proactively at the end of conversations — no extra CLAUDE.md setup needed.

---

## Configuration

Config is stored at `~/.memex/config.json`.

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
  memex.db          — SQLite DB (notes + sqlite-vec embeddings)
  models/           — cached embedding model

<vault>/
  *.md              — notes (Obsidian-compatible)
```

Monorepo packages:

| Package | Role |
|---------|------|
| `@memex/db` | SQLite schema, drizzle queries, sqlite-vec integration |
| `@memex/embed` | Local embedder via @huggingface/transformers |
| `@memex/utils` | Config, path helpers, shared utilities |
| `@memex/mcp` | MCP server (bundled into CLI dist) |

---

## Works with Herald

Memex is the memory layer of the [Herald](https://ai-herald.vercel.app) ambient voice assistant stack. When connected, Herald can:

- recall past conversations and decisions by voice
- save new insights mid-conversation without typing
- answer "what did I think about X?" with context from your second brain

Herald + Memex + [Firma](https://github.com/evan-moon/firma) — ambient voice, persistent memory, and financial intelligence in one personal AI stack.

---

## License

MIT
