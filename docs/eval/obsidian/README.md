# memex vs Obsidian Smart Connections

Self-reported retrieval numbers are worth very little. This measures memex
against the tool most of its users already have, on the same notes, with the
same queries, scored the same way.

## Why this comparison and not another

Smart Connections is the only fair free local comparison: memex notes are
already markdown, so the identical corpus can be handed to both. Mem and Notion
would need an import, cost money, and end up searching a different corpus.

## Fairness rules, and what enforces them

| Rule | How |
|---|---|
| Same corpus | `build-vault.mts` writes every indexed note out of the DB. memex indexes three roots; pointing Obsidian at the vault folder alone would leave it 261 notes short. |
| Same text | Files are written from the DB's stored content, not copied from disk, so neither tool sees a version the other does not. |
| Answerable key | Files are named `<title> (#id).md`. On disk 134 blog notes are called `index.md` and 118 are `en.md` — unusable as an answer key and unreadable in a file list. |
| Queries fixed first | `sample.mts` selects and freezes them before either tool runs. |
| Representative queries | The golden set over-samples blog posts (77% of its answers, 19% of the corpus). `sample.mts` resamples to the corpus mix, and spreads picks over where in the note the answer lives. |
| No home advantage | Series collapse is off for this run: Smart Connections has no equivalent, and leaving it on would score a deliberate diversity trade as a retrieval difference. |
| Same cut | Top 10, note level. Smart Connections returns blocks — record the note each block belongs to, first occurrence only, and skip repeats. |
| Paired analysis | Both tools answer the same queries, so `score.mts` works on per-query differences, not two averages. |

## Running it

```bash
node --import tsx docs/eval/obsidian/build-vault.mts   # ~/Documents/memex-eval-vault
node --import tsx docs/eval/obsidian/sample.mts        # golden-set.json (40 queries)
node --import tsx docs/eval/obsidian/run-memex.mts     # memex.json + blank obsidian.csv
```

Then, by hand — this is the only manual part:

1. Open `~/Documents/memex-eval-vault` as a vault in Obsidian.
2. Install **Smart Connections**, and wait for it to finish embedding all 1,350 notes.
3. For each query in `obsidian.csv`, run it through Smart Connections' search.
4. Record the `#id` of the top 10 notes it returns, in order, in `rank1`..`rank10`.
   - The id is in the filename: `어떤 노트 (#1234).md` → `1234`.
   - Blocks from the same note count once, at their best position.
   - If it genuinely returns nothing, put `0` in `rank1`. Leaving a row blank
     stops scoring rather than counting as a miss for Obsidian.

```bash
node --import tsx docs/eval/obsidian/score.mts
```

## Reading the result

`score.mts` reports hit@1/5/10, MRR@10 and nDCG@10 for both tools, split by
notes vs blog, plus a bootstrap 95% CI on the mean per-query MRR difference and
a sign test.

The verdict rule is fixed in advance: **the interval has to exclude zero.** At
40 queries a difference under roughly 0.1 MRR will not clear that bar, and the
honest answer there is "this sample cannot tell them apart" — not the point
estimate.
