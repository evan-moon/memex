# Product

<!-- impeccable:product-schema 1 -->

> **2026-09-08 — 방향 갱신.** 이 문서의 '사람은 고칠 때만 쓴다', '읽기 수요 없음',
> 'past라서 사람도 원문을 편집할 수 없다'는 전제는
> [제품 재설계](../../docs/plans/2026-09-08-second-brain-product-redesign.md)로 대체됐다.
> 대체된 문장은 지우지 않고 아래에 표시한다. 아직 구현되지 않은 것은 목표로 적고,
> 지금 동작하는 것과 구분한다.

## Platform

web (Electron desktop app; the window loads `memex://app/` and `apps/desktop/src/serve.ts` answers every request. There is no browser path and no port.)

## Users

The vault owner. The first user is **an individual who already has Markdown material and a habit of working with an AI** — they read their own material, write from it, and want the AI to work from the same shelf. Expansion to the general non-developer is taken up after the first value is confirmed, not assumed now.

They install the app, the app registers the MCP server, and from then on they work in this app and in conversation. The CLI is not on their path.

Usage scene: **reading and writing, with supervision beside it.** They open the app to continue a piece of writing, to find what they already recorded, and — when something the AI remembered is wrong — to settle it. Memory review is reachable on its own and from the document it concerns; it is not the day's assigned work.

> ~~Superseded (2026-09-08): "supervision, not reading. The daily reading habit hypothesis is discarded — the log shows the app accounts for 0.36% of all reads."~~ That reading was measured on one vault's past logs, when the app had no writing surface. Absence of reading in a tool that could not be written in is not evidence of no demand for writing. The number stands; the conclusion drawn from it does not.

## Product Purpose

memex is a personal Second Brain: **the material, experience and thinking I have accumulated, used by me and by an AI together, to carry the next piece of writing or work forward.**

The loop: leave it behind → find and understand it → write and decide → leave the result behind again.

Two things are true at once and neither is subordinate:

- **A person reads and writes here directly.** Documents are theirs. They edit freely, and every version is recoverable.
- **An AI uses the same vault.** It finds evidence, proposes changes, and records the memories it is allowed to record.

A memory the AI got wrong still reaches the person, and this app is still the door for that judgement. What changed is that it is no longer the only reason to open the app.

## Positioning

**Documents and memories are different things.** A document is the original a person handles. A memory is a claim extracted from documents and conversations for later work. The same document can hold both a past event and a current fact; the kind of document does not decide how long a fact stays true.

| Concept | Example | Rule |
|---|---|---|
| Document | note, reference, draft, finished piece | freely edited; original and versions preserved |
| Memory | the current launch date, why a decision was made | carries evidence document/passage/revision, scope, change history |
| Instruction | a writing skill, a coding rule | chosen per task with a stated scope; reading one does not run it |

`past` / `state` / `rule` remain as **compatibility metadata on the memory contract**. They are what the existing MCP memory calls speak, and they stay. They no longer decide whether a person may edit their own file:

- `past` — a record of what happened. It remains the memory layer whose *claims* are corrected by a new note rather than rewritten. The person may still edit the document's text, and the edit is kept as a revision.
- `state` — a projection of what is true now. Freely updatable, and it declares the records it was built from.
- `rule` — standing guidance for the agent. Proposed by the agent, injected only after a person approves it.

> ~~Superseded (2026-09-08): "`past` is immutable; a `past` note has no pencil at all."~~ Editing the text of a record and correcting the claim inside it are separate operations by design. The first is a normal edit with history; the second is still a correction. Built 2026-09-10: a record has a pencil, its body goes through the document write, and every version is kept. An agent is still sent to a correction.

Nothing else in this category makes forgetting explicit. Because an agent never forgets, memex replaces forgetting with three named mechanisms: retirement of a claim (`invalidates`), retrieval budget, and cued recall.

## Operating Context

Routes today: `/` overview, `/today`, `/topic/:tag`, `/threads`, `/thread/:id`, `/note/:id`, `/new`, `/search`, `/tags`, `/rules`, `/register`, `/register/:subject`, `/repair/evidence`, `/inference/:id`, `/settings`.

Routes the redesign adds: `/library`, `/memory`, `/memory/:subjectKey`. Nothing in the list above is deleted in v1 — the auxiliary screens move under settings or under the screen they belong to, and existing deep links keep working.

The shell carries a vault tree sidebar, note tabs, and a command palette. A document opens in reading or editing depending on what it is and what the person last chose for it.

Vault: ~1,400 notes — mostly `past`, then `state` and `external`, a handful of `rule`. Notes run from 300 to 22,000 characters. Korean is the primary content language.

## Capabilities and Constraints

- React 19 + Tailwind v4 (`@theme inline` tokens in `apps/ui/src/styles.css`), react-router, CodeMirror 6 editor, Vite. Electron shell with a hidden title bar, so the page provides the window's drag handle.
- Light and dark themes, both required. `data-theme` on the root, plus a system default.
- Korean and English interface strings (`apps/ui/src/i18n.ts`), Korean primary. Korean copy is 해요체.
- Every screen is served from local SQLite through `/api/*`; no network latency, no loading spinners for data that is already local.
- Notes render as Markdown with wiki links, and long notes are read for minutes at a time.
- **Writing works without an AI or an embedding model.** Creating, editing, saving and reopening a document must not wait on a provider or on model weights. Semantic search and AI assistance arrive when they are ready, and say so while they are not.
- A correction names the sentences it retires; the screen shows which claim went and whether the rest of the note stands.

## Brand Commitments

- Name: **memex**, lowercase.
- Korean UX copy follows 토스-style plainness: 해요체, no 번역투, no metaphor standing in for an instruction.
- No em dash in product copy.
- The app is the product. If a thing cannot be done here, it cannot be done.

## Evidence on Hand

- `docs/plans/2026-09-08-second-brain-product-redesign.md` — why, and what replaces the earlier premise.
- `docs/plans/2026-09-08-memex-experience-spec.md` — screens, states, scope.
- `docs/plans/2026-09-08-memex-domain-contract.md` — storage, permissions, failure recovery.
- `docs/plans/2026-08-28-what-memex-is.md` — the earlier definition this one supersedes in part.
- `CLAUDE.md` — surface policy and note conventions.

## Design constraints (memex #2280, as amended)

Still in force:

- Home groups by meaning, never by file path, for the memory items it shows.
- No standing backlog counter. A review session is 3-5 items and it ends.
- Metaphor never replaces standard navigation.
- No shell or information-structure redesign without explicit approval. The 2026-09-08 redesign **is** that approval, for the scope those documents describe and no wider.

Amended by the redesign:

- ~~"The app is not a general note app."~~ It is a document workspace *and* a memory base. What it is still not: a file browser, a knowledge-graph viewer, a sync client, a publishing tool.
- ~~"Home's first hierarchy is what needs the person's judgement."~~ Home leads with the work in progress. Memory items that need a decision appear as related changes, and in full on the memory screen.

> Rule note #2280 is canonical in the vault and is injected into MCP sessions. Editing this file does not retire it. A replacement rule has to be written and approved by the person in the app.

## Open Decisions

- Which existing vault syntax and attachment formats must be supported (design doc §10, undecided).
- Default AI provider, and whether other devices need syncing.
- Whether the general non-developer is the target after the first flow is confirmed.
