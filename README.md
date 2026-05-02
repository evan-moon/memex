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
- **MCP server** — Claude can save and search your second brain mid-conversation
- **CLI** — add, search, list, show, delete notes from the terminal
- **Local DB** — SQLite + [`sqlite-vec`](https://github.com/asg017/sqlite-vec) stored inside the vault at `.memex/memex.db`

---

## Install

```bash
npm install -g @evan-moon/memex
```

On first run the embedding model (~120MB) is downloaded once to `~/.memex/models/`.

---

## CLI

```bash
memex add                                   # interactive prompt
memex add --title "Note title" --content "..." 
memex add --title "Note title" --file ./note.md

memex list                                  # recent 10 notes
memex list --limit 20

memex search "semantic search query"        # multilingual
memex search "지식 관리" --limit 10

memex show <id>
memex delete <id>
memex delete --yes <id>                     # skip confirmation

memex config show
memex config set vault-path ~/Documents/Second\ Brain

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
| `save_note` | Save a note (title + markdown content) |
| `search_notes` | Semantic search across all notes |
| `list_notes` | List recent notes |
| `get_note` | Get full content of a note by ID |
| `delete_note` | Delete a note by ID |

---

## Configuration

Config is stored at `~/.memex/config.json`.

| Key | Default | Description |
|-----|---------|-------------|
| `vault_path` | `~/Documents/Second Brain` | Directory where `.md` files are saved |

```bash
memex config set vault-path ~/my-vault
```

---

## Architecture

```
~/.memex/
  config.json       — vault path and settings
  models/           — cached embedding model

<vault>/
  *.md              — notes (Obsidian-compatible)
  .memex/
    memex.db        — SQLite DB (notes table + sqlite-vec embeddings)
```

Monorepo packages:

| Package | Role |
|---------|------|
| `@memex/db` | SQLite schema, drizzle queries, sqlite-vec integration |
| `@memex/embed` | Local embedder via @huggingface/transformers |
| `@memex/utils` | Config, path helpers, shared utilities |
| `@memex/mcp` | MCP server (bundled into CLI dist) |

---

## License

MIT
