# Memex

Evan's memory engine — semantic search over personal notes, powered by SQLite + vector embeddings.

## Architecture

```
apps/
├── cli/   # memex CLI — the safety net (see surface policy below)
├── docs/  # memex.sh — the marketing and documentation site (Next.js)
└── mcp/   # MCP server — exposes memex tools to Codex
packages/
├── core/   # Note service shared by cli/mcp (save/edit/search/delete)
├── db/     # SQLite client, schema, repository (drizzle + sqlite-vec)
├── embed/  # Embedding model wrapper (@huggingface/transformers)
├── llm/    # Provider layer for the CLI-backed models (claude-code, codex)
├── rerank/ # Cross-encoder reranker, opt-in via MEMEX_RERANK=1
└── utils/  # Config loader, path helpers, formatters, note chunker
```

DB lives at `~/.memex/memex.db`. Model cache at `~/.memex/models/`.

`openDb` snapshots the database to `memex.db.bak-<YYYYMMDD-HHMMSS>` whenever a schema migration
is pending and the vault is not empty, then keeps the newest three. It uses `VACUUM INTO` rather
than copying the file, because the MCP server and the CLI are both attached in WAL mode and a
filesystem copy can be torn mid-transaction — if you ever copy the DB by hand, take `-wal` with
it. A snapshot that fails does not stop the database from opening; `memex stats` prints how many
backups are kept and when the newest was taken.

## What memex is

**memex defines memory explicitly so it can be retrieved correctly without anyone reading or
maintaining it.**

There is no window, no editor, and no screen. The reader is always a model, reaching memex through
MCP. That is the constraint every design decision answers to:

- A note's **layer** and **sections** are declared at write time, because that is the only moment
  the writer knows how long the thing stays true. Nothing downstream has to guess.
- A correction states **what** it corrects (`amends` / `amends_kind` / `invalidates`), so every
  surface that returns the old note carries the fix. Nobody has to notice and clean up.
- A `state` note names its **evidence** (`derives_from`), so it can be rechecked by comparison
  rather than by someone rereading the vault.
- **Signals and inferences** are deterministic. They are not a backlog for a person to clear; they
  are material the retrieval path uses.

The test for anything new: *does this still work if nobody ever opens the vault?* If it needs a
human to read, curate, approve on a schedule, or clear a queue, it is the wrong design.

> **Superseded 2026-09-20.** memex used to ship an Electron app, and its premise was *"a person
> reads and writes in it, and an AI works from the same vault."* Both are retired. Asking a person
> to review documents an LLM wrote does not scale, and a vault that needs curating rots. The
> desktop app, the React screens, the in-app chat, the prose reviewer and the app-only service
> layer were removed, and schema v33 drops the seven tables only the app ever wrote. The plan
> documents written for that direction were deleted with them, so anything still under
> `docs/plans/` is engine history, not a roadmap.
>
> Rule notes in the vault may still carry the older premise and are injected into MCP sessions.
> Changing this file does not retire them — replace or demote them with `memex layer <id> <layer>`.

## Surface policy

**MCP is the product. The CLI is a developer's diagnostic and repair tool.**

New capability goes to MCP. **Do not grow the CLI** — it is already past what a safety net should
be (21 commands). Existing commands stay in these groups (mirrored in `memex --help`):

- **Setup**: `mcp`, `recall`, `config`
- **Capture** (manual entry and AI-mistake correction): `add`, `edit`, `delete`, `capture-commit`
- **Vault** (external sources & embeddings): `source`, `index`, `reembed`
- **Verify** (inspect what landed in the DB; `tags tidy` is the one write, and it proposes before it applies): `search`, `list`, `show`, `related`, `tags` (+ `tags tidy`)
- **Insight engine** (deterministic signal/inference operations): `signals` (+ `signals mint`), `inferences`, `digest`, `layer`
- **Maintenance** (measurement & scheduling): `stats` (+ `stats eval`, `stats flashback`), `schedule`

`memex layer <id> rule` is how a provisional rule becomes canonical — it is the one approval left,
and it is a deliberate command rather than a screen.

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

> Both conventions below are waiting as rule notes #2283 and #2284. Once they are promoted with
> `memex layer <id> rule` and the MCP server restarts, they arrive under `## House Rules` and this
> section goes.

Template convention — **a note's sections follow its `layer`, because that is what decides how
long it stays true.** A save without them is rejected and names what is missing.

| layer | sections | what the shape is for |
|---|---|---|
| `past` | `## 맥락` · `## 무슨 일이 있었나` · `## 결정과 이유` · `## 이것이 바꾼 것` | the last one holds the state-lifetime content of the conversation, one line per thing that is now true, so a later `invalidates` has a sentence to quote. Nothing reads it yet |
| `state` | `## 지금 참인 것` · `## 아직 모르는 것` · `## 남은 것` | one claim per line under the first, because that is the granularity `invalidates` names |
| `rule` | `## 규칙 한 줄` · `## 적용 조건` · `## 예외` · `## 어기면 보이는 것` · `## 근거 노트` | the fourth is what lets a rule be retired without rereading the notes behind it |

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
