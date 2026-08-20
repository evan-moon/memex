import { sep } from 'node:path';
import { listNotes, type MemexClient, type Note, parseTags } from '@memex/db';
import { findTagVariants, type TagVariant } from '@memex/utils';

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
