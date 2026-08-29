import { filenameKey, titleKey } from '@memex/utils';
import type { MemexClient } from './client.ts';

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

// `[[Note|shown as this]]` targets `Note`; the rest is display text. The `#` in
// `[[Note#Heading]]` is an anchor — but a title may hold one too, and this vault
// names notes after the id they answer, so 38 of them carry a `#` and were
// unreachable while the anchor was cut here, with no title yet in reach to check
// against. Extraction keeps what was written; resolution decides what it meant.
// Composed forms are normalized because the vault holds both NFC and NFD
// spellings of the same Korean title.
export const linkTargets = (content: string): string[] => [
  ...new Set(
    [...content.matchAll(WIKI_LINK_RE)]
      .map((m) => m[1].split('|')[0].trim().normalize('NFC'))
      .filter(Boolean),
  ),
];

const anchorless = (target: string) => {
  const cut = target.indexOf('#');
  return cut === -1 ? '' : target.slice(0, cut).trim().normalize('NFC');
};

// The two names a wiki link can call a note by, kept as rows so resolving one
// is a point lookup. Held apart by kind because they do not rank the same: a
// title collision goes to the newest note, a filename collision to the oldest,
// which is what a Map built over every row used to decide by insertion order.
export const titleLookupKeys = (title: string) => {
  const asTitle = titleKey(title);
  const asFilename = filenameKey(title);
  return asFilename === asTitle
    ? [{ key: asTitle, kind: 'title' as const }]
    : [
        { key: asTitle, kind: 'title' as const },
        { key: asFilename, kind: 'filename' as const },
      ];
};

// The two keys a target could resolve under, worked out once at write time.
// Both are functions of the written link alone, so they stay true against a
// corpus that keeps growing around them.
export const targetLookupKeys = (target: string) => {
  const stem = anchorless(target);
  return { keyFull: titleKey(target), keyStem: stem ? titleKey(stem) : null };
};

export const syncTitleKeys = (client: MemexClient, noteId: number, title: string) => {
  const remove = client.sqlite.prepare('DELETE FROM note_title_keys WHERE note_id = ?');
  const insert = client.sqlite.prepare(
    'INSERT OR IGNORE INTO note_title_keys (key, kind, note_id) VALUES (?, ?, ?)',
  );
  client.sqlite.transaction(() => {
    remove.run(noteId);
    for (const { key, kind } of titleLookupKeys(title)) insert.run(key, kind, noteId);
  })();
};

export const dropTitleKeys = (client: MemexClient, noteId: number) => {
  client.sqlite.prepare('DELETE FROM note_title_keys WHERE note_id = ?').run(noteId);
};

export const syncLinkTargets = (client: MemexClient, noteId: number, content: string) => {
  const remove = client.sqlite.prepare('DELETE FROM note_link_targets WHERE note_id = ?');
  const insert = client.sqlite.prepare(
    `INSERT OR IGNORE INTO note_link_targets (note_id, ord, target, key_full, key_stem)
     VALUES (?, ?, ?, ?, ?)`,
  );
  client.sqlite.transaction(() => {
    remove.run(noteId);
    linkTargets(content).forEach((target, ord) => {
      const { keyFull, keyStem } = targetLookupKeys(target);
      insert.run(noteId, ord, target, keyFull, keyStem);
    });
  })();
};

export const dropLinkTargets = (client: MemexClient, noteId: number) => {
  client.sqlite.prepare('DELETE FROM note_link_targets WHERE note_id = ?').run(noteId);
};

const TITLE_HIT = `SELECT note_id AS noteId FROM note_title_keys
   WHERE key = ? AND kind = 'title' ORDER BY note_id DESC LIMIT 1`;

const FILENAME_HIT = `SELECT note_id AS noteId FROM note_title_keys
   WHERE key = ? AND kind = 'filename' ORDER BY note_id ASC LIMIT 1`;

const keyLookup = (client: MemexClient) => {
  const asTitle = client.sqlite.prepare(TITLE_HIT);
  const asFilename = client.sqlite.prepare(FILENAME_HIT);

  return (key: string) => {
    const titled = asTitle.get(key) as { noteId: number } | undefined;
    if (titled) return titled.noteId;
    const named = asFilename.get(key) as { noteId: number } | undefined;
    return named?.noteId;
  };
};

// A `[[X]]` link names either a note's title or the file it was written to,
// and those two differ whenever the title held a character a filesystem rejects
// — a slash, a question mark. Matching on the title alone called a third of
// this vault's links dead with the note they meant sitting right there.
export const resolveLinkTargets = (client: MemexClient, targets: string[]): Map<string, number> => {
  if (targets.length === 0) return new Map();

  const lookup = keyLookup(client);

  // Written form first, so a title that contains a `#` wins over reading the
  // same characters as an anchor. Only what no note is named falls through to
  // being cut at the `#`.
  return targets.reduce((acc, target) => {
    const stem = anchorless(target);
    const id = lookup(titleKey(target)) ?? (stem ? lookup(titleKey(stem)) : undefined);
    return id === undefined ? acc : acc.set(target, id);
  }, new Map<string, number>());
};

export const syncLinks = (client: MemexClient, sourceId: number, content: string) => {
  client.sqlite
    .prepare("DELETE FROM note_links WHERE source_id = ? AND source = 'wiki'")
    .run(sourceId);

  const resolved = resolveLinkTargets(client, linkTargets(content));
  if (resolved.size === 0) return;

  const insert = client.sqlite.prepare(
    "INSERT OR IGNORE INTO note_links(source_id, target_id, source) VALUES (?, ?, 'wiki')",
  );
  for (const targetId of resolved.values()) insert.run(sourceId, targetId);
};

// An unmatched target is a dead link on disk, not just a missing row in
// note_links — nothing in the vault opens it, under either name.
export const findUnresolvedLinks = (client: MemexClient, content: string): string[] => {
  const targets = linkTargets(content);
  const resolved = resolveLinkTargets(client, targets);
  return targets.filter((target) => !resolved.has(target));
};

// A target is dead when neither name it could go by is one any note answers to.
// Asked of the two indexes rather than of every body in the vault, which is the
// only version of this question that survives a corpus too big to hold in memory.
const UNRESOLVED_WHERE = `SELECT t.note_id AS noteId, t.target
   FROM note_link_targets t
   WHERE NOT EXISTS (SELECT 1 FROM note_title_keys k WHERE k.key = t.key_full)
     AND (t.key_stem IS NULL
          OR NOT EXISTS (SELECT 1 FROM note_title_keys k WHERE k.key = t.key_stem))`;

const UNRESOLVED = `${UNRESOLVED_WHERE} ORDER BY t.note_id, t.ord`;

// Counted rather than remembered: a signal row records that a link was dead
// when detection last ran, and detection is skipped while nothing changes. The
// answer comes from the index every note is written into, so the number a
// screen shows always matches what opening the note would show.
export const unresolvedLinksByNote = (client: MemexClient): Map<number, string[]> => {
  const rows = client.sqlite.prepare(UNRESOLVED).all() as { noteId: number; target: string }[];

  return rows.reduce((acc, row) => {
    const dead = acc.get(row.noteId) ?? [];
    return acc.set(row.noteId, [...dead, row.target]);
  }, new Map<number, string[]>());
};

export const unresolvedLinksFor = (client: MemexClient, noteId: number): string[] =>
  (
    client.sqlite.prepare(`${UNRESOLVED_WHERE} AND t.note_id = ? ORDER BY t.ord`).all(noteId) as {
      target: string;
    }[]
  ).map((row) => row.target);

// The write paths keep both indexes current, so this exists for when they were
// not the ones writing: a note saved by a build that predates an index, or one
// whose backfill had already run and would not run again. `memex index` is
// where the vault and the index are reconciled, so it is where the check goes.
export const resyncLinkIndexes = (client: MemexClient) => {
  const notes = client.sqlite.prepare('SELECT id, title, content FROM notes').all() as {
    id: number;
    title: string;
    content: string;
  }[];

  const titled = new Set(
    (
      client.sqlite.prepare('SELECT DISTINCT note_id AS noteId FROM note_title_keys').all() as {
        noteId: number;
      }[]
    ).map((row) => row.noteId),
  );

  const extracted = (
    client.sqlite.prepare('SELECT note_id AS noteId, target FROM note_link_targets').all() as {
      noteId: number;
      target: string;
    }[]
  ).reduce((acc, row) => {
    const seen = acc.get(row.noteId) ?? new Set<string>();
    return acc.set(row.noteId, seen.add(row.target));
  }, new Map<number, Set<string>>());

  const staleTitles = notes.filter((note) => !titled.has(note.id));
  const staleTargets = notes.filter((note) => {
    const want = linkTargets(note.content);
    const have = extracted.get(note.id) ?? new Set<string>();
    return want.length !== have.size || want.some((target) => !have.has(target));
  });

  client.sqlite.transaction(() => {
    for (const note of staleTitles) syncTitleKeys(client, note.id, note.title);
    for (const note of staleTargets) syncLinkTargets(client, note.id, note.content);
  })();

  return { titles: staleTitles.length, targets: staleTargets.length };
};
