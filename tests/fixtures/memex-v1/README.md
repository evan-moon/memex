# memex v1 fixture vault

A synthetic vault for the second-brain v1 work. Nothing here is the user's
material: every name, date and decision is invented for testing.

It is deliberately **not a git repository**, because the first thing the design
asks for is version recovery in a vault that has no git history to lean on.
Anything that reads history here has to get it from memex's own revisions.

Point a test at this directory by copying it to a temp dir first. Tests must not
write into `tests/fixtures/` and must never touch `~/.memex` or the real vault.

## What each file is here to break

| File | The case it covers |
|---|---|
| `writing/ai-and-me.md` | the J1 manuscript, ~3,400 characters, quoting a reference |
| `writing/ai-and-me 2.md` | a second file whose **title is the same** as another note |
| `references/interview-2026-03.md` | a reference someone else wrote, quoted by the manuscript |
| `references/ops-handbook.md` | a reference containing an instruction-shaped sentence (A09) |
| `projects/launch-plan.md` | an explicit current plan — the memory J3 corrects |
| `projects/launch-plan-history.md` | a `past` record already corrected by a later note |
| `projects/copy-draft.md` | an AI-written draft, `origin: agent` |
| `rules/approved-tone.md` | an **approved** rule (`rule_status: canonical`) |
| `rules/proposed-brevity.md` | an **unapproved** rule (`rule_status: provisional`) |
| `notes/unknown-yaml.md` | frontmatter keys memex does not know, which must survive a round trip |
| `notes/broken-links.md` | wiki links pointing at nothing |
| `notes/with-image.md` | a relative local image path |
| `notes/no-frontmatter.md` | a plain Markdown file with no YAML at all |
| `notes/empty.md` | a file with frontmatter and no body |
| `notes/long-document.md` | ~23,000 characters, the length the experience spec asks to check |
| `assets/diagram.png` | the image `notes/with-image.md` points at |
