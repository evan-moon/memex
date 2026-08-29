# Memex

# Memex

Evan's second brain — semantic search over personal notes, powered by SQLite + vector embeddings.

## Architecture

```
apps/
├── cli/     # memex CLI — the safety net (see surface policy below)
├── desktop/ # The Electron app — the only way a person reaches the screen
├── mcp/     # MCP server — exposes memex tools to Claude
└── ui/      # The React screens, served by the app's own `memex://` handler
packages/
├── core/   # Note service shared by cli/mcp (save/edit/search/delete)
├── db/     # SQLite client, schema, repository (drizzle + sqlite-vec)
├── embed/  # Embedding model wrapper (@huggingface/transformers)
├── rerank/ # Cross-encoder reranker, opt-in via MEMEX_RERANK=1
└── utils/  # Config loader, path helpers, formatters, note chunker
```

DB lives at `~/.memex/memex.db`. Model cache at `~/.memex/models/`.

## Working on the UI

`yarn dev:app` runs the app against your real vault with the screen hot-reloading: Vite owns the
page and swaps a component without losing where you were, Electron owns everything else. The window
still loads `memex://app/` — the handler asks Vite for the page instead of reading it off disk, so
`/api` goes the same way it does in a packaged build. `yarn desktop` is the same thing without Vite,
which is what to reach for when the question is about packaging rather than the screen.

Both leave better-sqlite3 built for Electron's ABI. Run `yarn native:node` before the tests, or they
die with `ERR_DLOPEN_FAILED`.

There is no browser path and no port. The window loads `memex://app/`, and
`apps/desktop/src/serve.ts` answers every request — `/api/*` by handing it to `route()` unchanged,
everything else by reading `dist/renderer` off disk, with any path that is not a file falling back
to the page so a deep link survives a reload. `serve()` takes no Electron import, so it is tested
directly in `serve.test.ts` rather than through a window.

Neither a protocol handler nor an IPC invoke is told that the page stopped listening, so stopping
a turn is a request of its own (`/api/chat/cancel`) rather than a dropped connection.

Keep pure helpers out of files that export components. React Fast Refresh gives up on a module that mixes them and invalidates everything downstream, which costs you the state you were trying to keep. That is why `time.ts` and `drafts.ts` sit beside `bits.tsx` and `editing.tsx`.

## Who this is for

**memex is a note tool an AI uses. It does not assume a person types into it.**

The agent writes the memories — `past`, `state`, and `rule` alike. A person writes for exactly
one reason: the agent remembered something wrong. That is not a leftover chore handed to the
UI; an agent cannot know it is wrong, so the correction is information that only exists outside
the vault, and the app is its only door in.

The target user is **not a developer**. They install the app, the app registers the MCP server,
and from then on they work in conversation and in the app. The CLI is not on that path.

`rule` is the one layer with a feedback loop — what the agent writes becomes its own next input.
So `save_note` may write a rule, but it lands `provisional` and is not injected until a person
approves it in the app. See `docs/plans/2026-08-28-what-memex-is.md`.

## Surface policy

**App + MCP for everyone. The CLI is a developer's diagnostic and repair tool.**

New features go to the app and MCP. **Do not grow the CLI** — it is already past what a safety
net should be (28 commands), and what the app absorbs is decided when the app is designed, not
before. Existing commands stay in these groups (mirrored in `memex --help`):

- **Setup**: `mcp`, `recall`, `config`
- **Capture** (manual entry and AI-mistake correction): `add`, `edit`, `delete`, `capture-commit`
- **Vault** (external sources & embeddings): `source`, `index`, `reembed`
- **Verify** (inspect what landed in the DB; `tags tidy` is the one write, and it proposes before it applies): `search`, `list`, `show`, `related`, `tags` (+ `tags tidy`)
- **Insight engine** (deterministic signal/inference operations): `signals` (+ `signals mint`), `inferences`, `digest`, `layer`
- **Maintenance** (measurement & scheduling): `stats` (+ `stats eval`, `stats flashback`), `schedule`

**Read** is no longer a CLI group. The one screen is the Electron app: browse by topic and see what
a later note corrected, fix what was remembered wrong by saying it (`/chat`), and connect an app to
memex (`/connect`), because the non-developer cannot type `memex mcp install`. Signals appear there
as annotations in context, and in a finite daily session that empties — never as a standing backlog
counter.

Do NOT extend beyond these groups. Prefer a subcommand of an existing command over a new top-level command (`signals mint`, `stats eval`, `tags tidy`).

The MCP tool surface is deliberately small (14 tools) — **duplicate read paths** give the model more ways to pick wrong; consolidate before enumerating. This bounds read paths, not write kinds: a genuinely new kind of write (`set_register`) is not what that rule is guarding against.

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

Correction convention — a `past` note can never be edited, so corrections are new notes. Pass `amends: <id>` whenever you write about something already recorded, and say which of the two things you are doing with `amends_kind`:

- `corrects` — something in the earlier note is no longer true. Search stops returning it on its own and points at the correction.
- `continues` (the default) — the earlier note still holds and this carries it forward.

Both used to be one edge. A count of 74 pairs found 58% were continuations, which is how 37 notes came to be labelled "no longer true" while still being true. Choosing `corrects` when you only meant to add more puts that label back.

Link convention — a note's filename is its title, so `[[Exact Note Title]]` is the only form that links. Search first and copy the title verbatim; `[[Title|display text]]` when the sentence needs other wording. Never `[[Title]](#1234)`, `[[1234]]`, `[label](path/note.md)`, or `[[some-memory-key]]` — those render as dead text. Reference an id in prose as plain `#1234`. `save_note`/`update_note` report links that resolve to nothing.
