# Live Preview parity — what "the same as Obsidian" means

The editor is judged against Obsidian's Live Preview on the same vault, opening
the same note in both. Parity is a checklist, not a feeling: each row is either
matched or it is not, and the list is what says when to stop.

## The one rule underneath all of it

Markers hide when the caret is elsewhere and come back when the caret enters the
construct. Everything below is that rule applied to one piece of syntax.

## Checklist

| # | Construct | Matched |
|---|---|---|
| 1 | Heading — sized, `#` hidden | ☐ |
| 2 | Bold / italic / strikethrough | ☐ |
| 3 | Inline code | ☐ |
| 4 | Fenced code block, highlighted | ☐ |
| 5 | Bullet list — `-` drawn as a bullet | ☐ |
| 6 | Ordered list | ☐ |
| 7 | Task list — checkbox, clickable | ☐ |
| 8 | Blockquote — left rule | ☐ |
| 9 | Table | ☐ |
| 10 | `[[Wikilink]]` — brackets hidden, clickable | ☐ |
| 11 | `[[` autocomplete over vault titles | ☐ |
| 12 | External link `[text](url)` | ☐ |
| 13 | Image | ☐ |
| 14 | Horizontal rule | ☐ |
| 15 | `#tag` | ☐ |
| 16 | YAML frontmatter as properties | ☐ |
| 17 | Caret on a line reveals that line's raw markdown | ☐ |

## Editing, not painting

A live preview that cannot be typed in is a renderer. These are not optional.

| # | Behaviour | Matched |
|---|---|---|
| 18 | Korean IME — composition survives decoration | ☐ |
| 19 | Undo / redo | ☐ |
| 20 | Enter continues a list; empty item ends it | ☐ |
| 21 | Tab / Shift-Tab indents a list item | ☐ |
| 22 | Find within the note | ☐ |

## What is deliberately not matched

Block drag handles, nested toggles and database views have no markdown to round
trip through. The file is the truth here, so a construct that cannot be written
down is not a construct memex has.
