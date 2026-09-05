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

`openDb` snapshots the database to `memex.db.bak-<YYYYMMDD-HHMMSS>` whenever a schema migration
is pending and the vault is not empty, then keeps the newest three. It uses `VACUUM INTO` rather
than copying the file, because the app, the MCP server and the CLI are all attached in WAL mode
and a filesystem copy can be torn mid-transaction — if you ever copy the DB by hand, take
`-wal` with it. A snapshot that fails does not stop the database from opening; `memex stats`
prints how many backups are kept and when the newest was taken.

## Working on the UI

`yarn dev:app` runs the app against your real vault with the screen hot-reloading: Vite owns the
page and swaps a component without losing where you were, Electron owns everything else. The window
still loads `memex://app/` — the handler asks Vite for the page instead of reading it off disk, so
`/api` goes the same way it does in a packaged build. `yarn desktop` is the same thing without Vite,
which is what to reach for when the question is about packaging rather than the screen.

better-sqlite3 is built against V8's ABI, so one build cannot serve both runtimes. `yarn native`
keeps two — `better_sqlite3-node.node` and `better_sqlite3-electron.node`, side by side in
`node_modules/better-sqlite3/build/Release` — and `openDb` names the one it can load. The app, the
MCP server and the tests all run at the same time; nothing is swapped, and nothing has to be put
back. `dev:app`, `desktop` and `package:mac` run it for you, and it does nothing when both builds
are already there for the current Node and Electron.

A packaged app carries only the Electron build, and a checkout that never ran the script has only
the one file `yarn install` fetched. In both cases `openDb` names nothing and `bindings` decides, as
it did before.

Vite hot-reloads the page and nothing else. Everything the window talks to reaches it through a
build chain that a restart only half re-runs:

```
apps/cli/src/services/**  →  yarn workspace @evan-moon/memex build  →  apps/cli/dist/host.js
apps/desktop/src/main.ts imports @evan-moon/memex/host — the dist file, not the source
        →  tsup bundles it into apps/desktop/dist/main.js  →  Electron
```

`dev-app.mjs` builds the desktop bundle once at startup and never touches `apps/cli/dist`. So a
change under `apps/cli/src/services/**` (chat, the API routes) needs **`yarn workspace
@evan-moon/memex build` first, then a restart** — restarting alone rebundles the stale dist. The
tell is a screen showing your new markup while answering with the old logic; confirm with
`grep -c '<a string you just wrote>' apps/desktop/dist/main.js`.

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

**The MCP server sends its own instructions.** Search, save, folders, links, tags, corrections
(`amends` / `amends_kind` / `invalidates`) and rule `scope` are stated there — `apps/mcp/src/index.ts` —
and every client that connects receives them, in this repo and outside it. They are not repeated here,
because two copies of one convention drift and only one of them is the copy that ships.

Approved `rule` notes are appended to that block under `## House Rules`, and where a rule contradicts
a convention above it, the rule wins.

What follows is what has not landed in either channel yet.

> Both conventions below are waiting as rule notes #2283 and #2284. Once a person approves them in the
> app and the MCP server restarts, they arrive under `## House Rules` and this section goes.

Template convention — **a note's sections follow its `layer`, because that is what decides how
long it stays true.** A save without them is rejected and names what is missing.

| layer | sections | what the shape is for |
|---|---|---|
| `past` | `## 맥락` · `## 무슨 일이 있었나` · `## 결정과 이유` · `## 이것이 바꾼 것` | the last one holds the state-lifetime content of the conversation, one line per thing that is now true, so a later `invalidates` has a sentence to quote. Nothing reads it yet |
| `state` | `## 지금 참인 것` · `## 아직 모르는 것` · `## 남은 것` | one claim per line under the first, because that is the granularity `invalidates` names |
| `rule` | `## 규칙 한 줄` · `## 적용 조건` · `## 예외` · `## 어기면 보이는 것` · `## 근거 노트` | the fourth is what lets a person retire a rule they approved |

Five types answer the same question in a different shape and override the skeleton: `세션기록`,
`정정`, `업무메모`, `작업지시서`, `제품작업`. Documents take no sections at all — `발행물`, `책`,
`초안`, `에세이`, `학습메모`, `코드문서`. `미분류` is **not** a way past the sections: it takes the
skeleton of its layer like anything else.

One conversation usually produces two notes, not one. What happened is `past`; what is now true is
`state`. Splitting them at write time is what keeps a later correction from calling a whole episode
out of date — the split is by lifetime, not by subject.

Evidence convention — a `state` note should pass `derives_from: [id, ...]`, the notes it was built
from. One that names its sources is checked by comparing them: when a source is later corrected or
rewritten, memex says so and names which. One that declares nothing can only be checked by guessing
which notes look related. The ids are known when you write it and not afterwards.
