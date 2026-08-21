import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { sep } from 'node:path';
import { listNotes, type MemexClient, type Note, parseTags, serializeTags } from '@memex/db';
import { findTagVariants, rewriteTags, type TagVariant } from '@memex/utils';

const tagCounts = (client: MemexClient): Map<string, number> =>
  (
    client.sqlite
      .prepare(
        'SELECT j.value AS tag, COUNT(*) AS c FROM notes n, json_each(n.tags) j GROUP BY tag',
      )
      .all() as { tag: string; c: number }[]
  ).reduce((acc, r) => acc.set(r.tag, r.c), new Map<string, number>());

export const renameMap = (variants: TagVariant[]): Map<string, string> =>
  variants.reduce(
    (acc, v) => v.drop.reduce((inner, d) => inner.set(d.tag, v.keep), acc),
    new Map<string, string>(),
  );

// Only the vault is ours to rewrite. An indexed source is someone else's
// repository — a blog's tag spellings are its published taxonomy, and a tidy
// that reaches in there is editing a website from a note command.
const inVault = (filePath: string, vault: string) =>
  filePath.startsWith(vault.endsWith(sep) ? vault : `${vault}${sep}`);

export type Pending = { note: Note; next: string[] };

export type TidyPlan = {
  ours: TagVariant[];
  external: TagVariant[];
  mine: Pending[];
  externalRoots: string[];
};

export const planTidy = (client: MemexClient, vault: string): TidyPlan => {
  const variants = findTagVariants(tagCounts(client));
  const rename = renameMap(variants);

  const all = listNotes(client, 100_000).flatMap<Pending>((note) => {
    const tags = parseTags(note.tags);
    const next = [...new Set(tags.map((t) => rename.get(t) ?? t))];
    return next.join(' ') === tags.join(' ') ? [] : [{ note, next }];
  });

  const mine = all.filter((p) => inVault(p.note.filePath, vault));
  const theirs = all.filter((p) => !inVault(p.note.filePath, vault));

  const affects = (v: TagVariant, notes: Pending[]) => {
    const dropped = new Set(v.drop.map((d) => d.tag));
    return notes.some(({ note }) => parseTags(note.tags).some((t) => dropped.has(t)));
  };

  return {
    ours: variants.filter((v) => affects(v, mine)),
    external: variants.filter((v) => !affects(v, mine) && affects(v, theirs)),
    mine,
    externalRoots: [...new Set(theirs.map((p) => p.note.filePath.split(`${sep}content${sep}`)[0]))],
  };
};

export type Applied = { notes: number; files: number; unwritten: string[] };

// Deliberately not updateNote(): that stamps updated_at, and a spelling fix is
// not a person revising a note. Bumping it would report every touched note as
// freshly written and flatten the staleness readings the dashboard is built on.
export const applyRenames = (
  client: MemexClient,
  rename: Map<string, string>,
  todo: Pending[],
): Applied => {
  const setTags = client.sqlite.prepare('UPDATE notes SET tags = ? WHERE id = ?');

  return client.sqlite.transaction(() =>
    todo.reduce<Applied>(
      (acc, { note, next }) => {
        setTags.run(serializeTags(next), note.id);

        const before = existsSync(note.filePath) ? readFileSync(note.filePath, 'utf8') : '';
        const after = before && rewriteTags(before, rename);
        if (after && after !== before) {
          writeFileSync(note.filePath, after, 'utf8');
          return { ...acc, notes: acc.notes + 1, files: acc.files + 1 };
        }

        // Nothing in the file carries the change, so the next `memex index`
        // puts the old spelling straight back. Say so rather than report a
        // clean number.
        return {
          ...acc,
          notes: acc.notes + 1,
          unwritten: [...acc.unwritten, `#${note.id} ${note.title}`],
        };
      },
      { notes: 0, files: 0, unwritten: [] },
    ),
  )();
};

const pendingFor = (client: MemexClient, vault: string, rename: Map<string, string>) => {
  const all = listNotes(client, 100_000).flatMap<Pending>((note) => {
    const tags = parseTags(note.tags);
    const next = [...new Set(tags.map((t) => rename.get(t) ?? t))];
    return next.join(' ') === tags.join(' ') ? [] : [{ note, next }];
  });
  return {
    mine: all.filter((p) => inVault(p.note.filePath, vault)),
    theirs: all.filter((p) => !inVault(p.note.filePath, vault)),
  };
};

export type RenameResult = Applied & { skipped: number };

// One verb for both moves a person makes: folding several spellings into one,
// and giving a tag a different name. A rename is a merge with one source.
export const renameTags = (
  client: MemexClient,
  vault: string,
  rename: Map<string, string>,
): RenameResult => {
  const { mine, theirs } = pendingFor(client, vault, rename);
  return { ...applyRenames(client, rename, mine), skipped: theirs.length };
};

export type MergeKind = 'spelling' | 'overlap';

export type MergeCandidate = {
  kind: MergeKind;
  keep: string;
  drop: string[];
  /** Notes the merge would rewrite. */
  notes: number;
  /** How much of the smaller tag the two share. Absent for spelling variants. */
  overlap?: number;
};

const MIN_SHARED = 5;
const SAME_THING = 0.95;

// Two tags that appear on almost exactly the same notes, in both directions.
// Unlike a spelling variant this is a guess — `toss` and `토스` score the same
// as a genuine pairing — so it is offered for a person to judge, never applied
// on its own.
const overlapCandidates = (client: MemexClient, covered: Set<string>): MergeCandidate[] => {
  const rows = client.sqlite
    .prepare(
      `WITH tagged AS (SELECT DISTINCT j.value AS tag, n.id AS id FROM notes n, json_each(n.tags) j),
            totals AS (SELECT tag, COUNT(*) AS total FROM tagged GROUP BY tag)
       SELECT a.tag AS a, b.tag AS b, COUNT(*) AS shared,
              ta.total AS totalA, tb.total AS totalB
       FROM tagged a
       JOIN tagged b ON a.id = b.id AND a.tag < b.tag
       JOIN totals ta ON ta.tag = a.tag
       JOIN totals tb ON tb.tag = b.tag
       GROUP BY a.tag, b.tag
       HAVING shared >= ?
       ORDER BY shared DESC`,
    )
    .all(MIN_SHARED) as { a: string; b: string; shared: number; totalA: number; totalB: number }[];

  return rows
    .filter(
      (r) =>
        r.shared / r.totalA >= SAME_THING &&
        r.shared / r.totalB >= SAME_THING &&
        !covered.has(r.a) &&
        !covered.has(r.b),
    )
    .map((r) => {
      const [keep, drop] = r.totalA >= r.totalB ? [r.a, r.b] : [r.b, r.a];
      const dropped = keep === r.a ? r.totalB : r.totalA;
      return {
        kind: 'overlap' as const,
        keep,
        drop: [drop],
        notes: dropped,
        overlap: r.shared / Math.min(r.totalA, r.totalB),
      };
    });
};

// Everything the vault suggests might be one tag: the spellings that provably
// are, then the pairs that behave as though they are.
export const mergeCandidates = (client: MemexClient, vault: string): MergeCandidate[] => {
  const { ours } = planTidy(client, vault);
  const spelling = ours.map((variant) => ({
    kind: 'spelling' as const,
    keep: variant.keep,
    drop: variant.drop.map((d) => d.tag),
    notes: variant.notes,
  }));
  const covered = new Set(spelling.flatMap((c) => [c.keep, ...c.drop]));
  return [...spelling, ...overlapCandidates(client, covered)];
};
