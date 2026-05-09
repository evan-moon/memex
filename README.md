<p align="center">
  <img src="https://raw.githubusercontent.com/evan-moon/memex/main/assets/og-image.png" alt="memex" width="560" />
</p>

<h1 align="center">memex</h1>

<p align="center">
  <strong>Make Claude smarter about you.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@evan-moon/memex"><img src="https://img.shields.io/npm/v/@evan-moon/memex?style=flat&color=black&label=npm" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/evan-moon/memex?style=flat&color=black" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@evan-moon/memex?style=flat&color=black" alt="Node version"></a>
</p>

<p align="center">
  <code>npm install -g @evan-moon/memex</code>
</p>

> Make Claude smarter about you.

Local-first second brain that connects to Claude via MCP. Notes are stored as plain Markdown and indexed with a local ML model — fully offline, no API keys, nothing leaves your machine.

---

## The problem

Claude is only as smart as what's in the conversation. Your decisions, your context, your thinking — invisible unless you paste them in every time.

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
- **Date filter** — narrow search to a time range with `--from` / `--to`
- **MCP server** — Claude searches and saves automatically. No extra CLAUDE.md setup needed
- **Duplicate detection** — `save_note` warns when a semantically similar note already exists, nudging Claude to update rather than create
- **Backlinks** — link notes with `[[Title]]` syntax; `get_note` shows which notes reference it
- **Digest** — `memex digest` summarises notes saved in the last N days, grouped by folder
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
memex search "query" --from 2026-04-01       # notes since a date
memex search "query" --from 2026-04-01 --to 2026-04-30

# Browse
memex list                                   # recent 10 notes
memex list --limit 20
memex show <id>
memex tags                                   # all tags with counts
memex related <id>                           # semantically related notes
memex digest                                 # summary of last 7 days
memex digest --days 30                       # summary of last 30 days

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
| `save_note` | Save a note — warns if a similar note already exists |
| `search_notes` | Semantic search; supports `category`, `tag`, `date_from`, `date_to` filters |
| `list_notes` | List recent notes |
| `list_tags` | List all tags with note counts |
| `list_folders` | List all folders with note counts |
| `get_note` | Get full content and backlinks of a note by ID |
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

## llms.txt

[`llms.txt`](llms.txt) is a machine-readable summary of this project for LLM agents — concise description with documentation links, following the [llms.txt standard](https://llmstxt.org/).

---

## License

MIT
