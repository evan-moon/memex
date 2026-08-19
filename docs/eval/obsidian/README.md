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
| Answerable key | Files are named `<title> (id N).md`. On disk 134 blog notes are called `index.md` and 118 are `en.md` — unusable as an answer key and unreadable in a file list. Not `(#N)`: Obsidian rejects `# ^ [ ] |` in note names, and Smart Connections responds by importing nothing at all. |
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
4. Record the id of the top 10 notes it returns, in order, in `rank1`..`rank10`.
   - The id is in the filename: `어떤 노트 (id 1234).md` → `1234`.
   - Blocks from the same note count once, at their best position.
   - If it genuinely returns nothing, put `0` in `rank1`. Leaving a row blank
     stops scoring rather than counting as a miss for Obsidian.

```bash
node --import tsx docs/eval/obsidian/score.mts
```

## Result, 2026-08-18

40 queries, corpus-representative (32 notes / 8 blog), 1,353-note vault, both
tools on the same e5 family — memex `multilingual-e5-base`, Smart Connections
`multilingual-e5-small`, its best multilingual option.

| | hit@1 | hit@5 | hit@10 | MRR | nDCG |
|---|---|---|---|---|---|
| memex | 25% | 38% | 55% | 0.331 | 0.381 |
| Smart Connections | 20% | 43% | 48% | 0.291 | 0.336 |

Mean per-query MRR difference +0.039, bootstrap 95% CI [-0.092, 0.170], 13 wins
to 9 with 18 ties (sign test p=0.523).

**Parity.** memex leads on hit@1, hit@10, MRR and nDCG and trails on hit@5, and
none of it clears the interval. At n=40 nothing under roughly 0.1 MRR can, so
the honest reading is that this sample cannot tell the two apart — not that
they are identical. Resolving a difference this small needs several hundred
queries.

Worth more than the comparison: **hit@1 25% is what real use looks like.** The
403-query set that development was tuned against reports 42%, and the gap is
composition — that set answers 77% blog posts, which are long and structured
and exactly where passage embedding helps most.

Two things about Smart Connections that are not scores. Its default model,
`TaylorAI/bge-micro-v2`, is English-only, so out of the box it is not a real
comparison on a Korean vault at all. And selecting the multilingual model did
not survive a restart here — it reverted to the default and every lookup then
returned nothing, which is worth knowing before trusting any number measured
right after a settings change.

## Reading the result

`score.mts` reports hit@1/5/10, MRR@10 and nDCG@10 for both tools, split by
notes vs blog, plus a bootstrap 95% CI on the mean per-query MRR difference and
a sign test.

The verdict rule is fixed in advance: **the interval has to exclude zero.** At
40 queries a difference under roughly 0.1 MRR will not clear that bar, and the
honest answer there is "this sample cannot tell them apart" — not the point
estimate.
