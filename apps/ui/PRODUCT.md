# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (Electron desktop app; the window loads `memex://app/` and `apps/desktop/src/serve.ts` answers every request. There is no browser path and no port.)

## Users

The vault owner, a **non-developer**. They install the app, the app registers the MCP server, and from then on they work in conversation and in this app. The CLI is not on their path.

Usage scene, per the operating contract (memex #2280): **supervision, not reading.** They open the app to see what changed in the AI's current beliefs since they last looked, and to settle the few items that need their judgement. The "daily reading habit" hypothesis is discarded: the log shows the app accounts for 0.36% of all reads and was opened on one day.

## Product Purpose

memex is an AI's hippocampus. **It is a note tool an AI uses; it does not assume a person types into it.**

The agent writes every memory — `past`, `state`, and `rule` alike. A person writes for exactly one reason: the agent remembered something wrong. An agent cannot know it is wrong, so that judgement exists only outside the vault, and this app is its only door in.

Success: a wrong or risky memory reaches the person before it is reused, they settle it in one short session, and the correction actually changes what the AI does next.

The loop the product exists for, in five steps: the AI writes or changes a belief → memex selects only what needs a person → the person sees why, what it will affect, and on what evidence → they approve, correct, or hold → the AI uses the corrected memory. A feature that cannot name which step it improves is not built.

## Positioning

Mutability is a first-class axis. Notes are separated by **how long they stay true**, not by subject:

- `past` — a record of what happened. Immutable. Corrections are new notes.
- `state` — a projection of what is true now. Freely updatable, and it declares the records it was built from.
- `rule` — standing guidance for the agent. Written by the agent, injected only after a person approves it.

Nothing else in this category makes forgetting explicit. Because an agent never forgets, memex replaces forgetting with three named mechanisms: retirement of a claim (`invalidates`), retrieval budget, and cued recall.

## Operating Context

Routes: `/` overview, `/today`, `/topic/:tag`, `/threads`, `/thread/:id`, `/note/:id`, `/search`, `/tags`, `/rules`, `/register`, `/register/:subject`, `/repair/evidence`, `/inference/:id`, `/settings`.

The shell carries a vault tree sidebar, note tabs, and a command palette. Reading is the default state of a note; editing is a mode you turn on, and a `past` note has no pencil at all.

Vault: ~1,373 notes — 874 `past`, 250 `state`, 239 `external`, 10 `rule`. Notes run from 300 to 22,000 characters. Korean is the primary content language.

## Capabilities and Constraints

- React 19 + Tailwind v4 (`@theme inline` tokens in `apps/ui/src/styles.css`), react-router, CodeMirror 6 editor, Vite. Electron shell with a hidden title bar, so the page provides the window's drag handle.
- Light and dark themes, both required. `data-theme` on the root, plus a system default.
- Korean and English interface strings (`apps/ui/src/i18n.ts`), Korean primary. Korean copy is 해요체.
- Every screen is served from local SQLite through `/api/*`; no network latency, no loading spinners for data that is already local.
- Notes render as Markdown with wiki links, and long notes are read for minutes at a time.
- A correction names the sentences it retires; the screen shows which claim went and whether the rest of the note stands.

## Brand Commitments

- Name: **memex**, lowercase.
- Korean UX copy follows 토스-style plainness: 해요체, no 번역투, no metaphor standing in for an instruction.
- No em dash in product copy.
- The app is the product for a non-developer. If a thing cannot be done here, it cannot be done.

## Evidence on Hand

- `docs/plans/2026-08-28-what-memex-is.md` — who this is for.
- `docs/plans/2026-09-04-note-templates-by-layer.md` — the mutability model as built.
- `CLAUDE.md` — surface policy and note conventions.

## Brand and design constraints (memex #2280)

- The app is not a general note app, a file browser, or a knowledge-graph viewer.
- Home groups by meaning (needs a decision / belief changed / conflict / evidence problem / rule approval), never by folder or file path.
- No standing backlog counter. A session is 3-5 items and it ends.
- Metaphor never replaces standard navigation. The sidebar, tabs, search position and routing are not changed for visual distinctiveness.
- No shell or information-structure redesign without explicit approval.

## Open Decisions

- The home information structure is being redesigned as its own task, approval-first.
