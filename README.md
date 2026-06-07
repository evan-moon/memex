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
- **Note layers** — every note is `past` (immutable record), `state` (mutable plan), or `rule` (Claude behaviour guide). Past notes refuse updates; rule notes auto-inject into Claude's system prompt
- **Flashback** — save and search automatically surface older notes from a *different folder* that are semantically related — "you wrote about this 124 days ago in a different context"
- **Inference engine** — deterministic *signals* surface un-synthesized patterns (cross-year arcs, stale state notes, tag revivals); you promote good ones into *inferences* (hypotheses with provenance) that auto-invalidate when their source notes change. No LLM in the core
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
memex add                                    # interactive prompt (asks for layer)
memex add --title "Note title" --content "..." --layer past
memex add --title "Note title" --file ./note.md --layer state
memex add --title "Note title" --content "..." --folder conversations/tom --layer past
memex add --title "Note title" --content "..." -T typescript -T architecture --layer past

# Layers
memex classify                               # distribution of past / state / rule
memex relayer <id> state                     # move a note to a different layer

# Search
memex search "semantic search query"         # multilingual
memex search "knowledge management" --limit 10    # multilingual: matches Korean/Japanese notes too
memex search "query" --tag typescript        # filter by tag
memex search "query" --from 2026-04-01       # notes since a date
memex search "query" --from 2026-04-01 --to 2026-04-30

# Browse
memex list                                   # recent 10 notes
memex list --limit 20
memex show <id>
memex tags                                   # all tags with counts
memex related <id>                           # semantically related notes
memex digest                                 # last 7 days + signals + inferences
memex digest --days 30                       # summary of last 30 days

# Insights (inference engine)
memex signals                                # detect un-synthesized patterns
memex signals --type hidden_arc              # one type only
memex signals dismiss <id>                   # triage (also: snooze)
memex mint <signalId>                        # print evidence bundle to synthesize
memex mint <signalId> --title "..." --summary "..." --confidence 0.7
memex inferences                             # list inferences (auto-flags stale)
memex schedule                               # print cron/launchd snippet (no daemon)

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
| `save_note` | Save a note — requires `layer`, warns if a similar note already exists, surfaces flashbacks |
| `search_notes` | Semantic search; supports `category`, `tag`, `date_from`, `date_to` filters; appends flashbacks for the top result |
| `list_notes` | List recent notes |
| `list_tags` | List all tags with note counts |
| `list_folders` | List all folders with note counts |
| `get_note` | Get full content and backlinks of a note by ID |
| `update_note` | Update title or content. Refuses `past` notes (with `[Amendment]` suggestion) and `rule` notes (user-only) |
| `delete_note` | Delete a note by ID |
| `get_signals` | Deterministic un-synthesized patterns (hidden_arc / stale_state / dangling_link / tag_burst) |
| `update_signal_status` | Triage a signal — dismiss or snooze |
| `list_inferences` | List synthesized hypotheses (re-checks staleness first) |
| `get_inference` | One inference with full provenance + change/delete markers |
| `mint_inference` | Persist an approved hypothesis — requires explicit confirmation |

Inferences are kept separate from notes (excluded from search) and are cited as hypotheses, never facts. Detection stays deterministic; the only LLM step is synthesizing an inference's summary, which Claude does — never memex.

### Note layers

Every note is classified into one of three layers based on mutability:

| Layer | Meaning | Claude's permission |
|-------|---------|---------------------|
| `past` | Record of what happened — retros, meetings, decision rationale, debugging sessions | Append-only. `update_note` refuses, suggesting an `[Amendment]` note instead |
| `state` | Current state or plans — project progress, roadmaps, a person's current role | Freely updatable |
| `rule` | Behaviour guide for Claude — coding style, search policy | Claude is read-only. Only the user writes |

The CLI prints a colour-coded `[past]` / `[state]` / `[rule]` badge next to each note in `list`, `search`, and `show`.

- `save_note` (MCP) and `memex add` (CLI) require an explicit `layer`. The classification rules are documented in the tool description so Claude picks correctly.
- On first run, existing notes get a folder-based backfill: `projects`/`dev`/`herald` → `state`, `coding` → `rule`, everything else → `past`. Migration is idempotent.
- `rule` notes are also auto-injected into the MCP server's instructions — see [Rule layer auto-inject](#rule-layer-auto-inject) below.

### Flashback

When you save a note or search, memex automatically surfaces older notes from a **different folder** that are semantically similar — "you wrote about this 124 days ago in a different context." Stored as system-generated backlinks (`note_links.source = 'flashback'`), separate from your `[[wikilinks]]` (`source = 'wiki'`).

Tune via env:

| Env | Default | Behaviour |
|-----|---------|-----------|
| `MEMEX_FLASHBACK_DAYS` | `90` | minimum age gap, in days |
| `MEMEX_FLASHBACK_DIST` | `0.4` | maximum vector distance (lower = stricter match) |
| `MEMEX_FLASHBACK_LIMIT` | `3` | max suggestions per surface |

### Rule layer auto-inject

Notes with `layer = 'rule'` are appended to the MCP server's instructions on boot, under a `## House Rules` section. Claude sees them at the start of every conversation — no `search_notes` call required. This is the right home for coding style guides or other behavioural guidance.

| Env | Default | Behaviour |
|-----|---------|-----------|
| `MEMEX_INJECT_RULES` | enabled | Set to `0` to disable injection entirely |
| `MEMEX_RULES_MAX_CHARS` | `8000` | Byte budget for the injected section; overflow is truncated with a `console.warn` |

Updates to rule notes are picked up on the next Claude Desktop / Claude Code restart.

---

## Configuration

Config lives at `~/.memex/config.json`.

| Key | Default | Description |
|-----|---------|-------------|
| `vault_path` | `~/Documents/Second Brain` | Directory where `.md` files are saved |
| `sources` | `[]` | Additional directories to index (e.g. existing Obsidian vaults) |
| `aliases` | `{}` | Search alias map, e.g. `{ "js": ["javascript", "ecmascript"] }` — values can be any language to bridge across scripts |

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
