#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const usage = `Reconnect [Amendment] notes written before amendment edges existed.

  node scripts/link-amendments.mjs [--db <path>] [--apply]

An amendment only protects you if search can find it from the note it corrects.
These were written when the only link was prose, so this recovers the target
three ways, most reliable first:

  1. an explicit "#1234" reference in the body
  2. the single wiki link the amendment carries
  3. the title with its [Amendment] prefix stripped, matched against note titles

Anything still ambiguous is printed rather than guessed. Dry run by default.`;

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const DB = arg('--db', join(homedir(), '.memex', 'memex.db'));
const APPLY = process.argv.includes('--apply');

const db = new Database(DB, { readonly: !APPLY });

const AMENDMENT_TITLE = /^\s*(?:\[[^\]]*\]\s*)*\[Amendment(?:\s+\d+)?\]\s*/i;

const amendments = db
  .prepare(
    `SELECT id, title, content, COALESCE(authored_at, created_at) AS at
     FROM notes
     WHERE title LIKE '%[Amendment%'
     ORDER BY at`,
  )
  .all();

const byId = db.prepare('SELECT id, title, COALESCE(authored_at, created_at) AS at FROM notes WHERE id = ?');
const byTitle = db.prepare(
  'SELECT id, title, COALESCE(authored_at, created_at) AS at FROM notes WHERE lower(title) = lower(?) LIMIT 1',
);
const wikiTargets = db.prepare(
  `SELECT n.id, n.title, COALESCE(n.authored_at, n.created_at) AS at
   FROM note_links l JOIN notes n ON n.id = l.target_id
   WHERE l.source_id = ? AND l.source = 'wiki'`,
);
const existing = db.prepare(
  "SELECT 1 FROM note_links WHERE source_id = ? AND source = 'amends'",
);

const strippedTitle = (title) => title.replace(AMENDMENT_TITLE, '').trim();

const olderThan = (candidate, amendment) =>
  candidate && candidate.id !== amendment.id && candidate.at <= amendment.at;

const resolve = (amendment) => {
  const idRefs = [...amendment.content.matchAll(/#(\d{2,5})\b/g)].map((m) => Number(m[1]));
  for (const ref of idRefs) {
    const candidate = byId.get(ref);
    if (olderThan(candidate, amendment)) return { target: candidate, how: 'id-ref' };
  }

  const links = wikiTargets.all(amendment.id).filter((l) => olderThan(l, amendment));
  if (links.length === 1) return { target: links[0], how: 'wiki-link' };

  const bare = strippedTitle(amendment.title);
  const exact = byTitle.get(bare);
  if (olderThan(exact, amendment)) return { target: exact, how: 'title' };

  if (links.length > 1) {
    const named = links.find((l) => bare.includes(l.title) || l.title.includes(bare));
    if (named) return { target: named, how: 'wiki-link+title' };
    return { target: null, how: `ambiguous (${links.length} links)` };
  }
  return { target: null, how: 'unresolved' };
};

const already = amendments.filter((a) => existing.get(a.id));
const todo = amendments.filter((a) => !existing.get(a.id));
const resolved = todo.map((a) => ({ amendment: a, ...resolve(a) }));
const linked = resolved.filter((r) => r.target);
const failed = resolved.filter((r) => !r.target);

const byHow = linked.reduce((acc, r) => ({ ...acc, [r.how]: (acc[r.how] ?? 0) + 1 }), {});

console.log(`${amendments.length} amendment notes · ${already.length} already linked`);
console.log(`resolved ${linked.length}/${todo.length} — ${JSON.stringify(byHow)}\n`);

const tokens = (title) =>
  new Set(
    strippedTitle(title)
      .toLowerCase()
      .split(/[\s—·\-,()\[\]]+/)
      .filter((t) => t.length >= 2),
  );

const shaky = linked.filter((r) => {
  const a = tokens(r.amendment.title);
  const b = tokens(r.target.title);
  return [...a].every((t) => !b.has(t));
});

for (const r of linked) {
  console.log(`  #${r.amendment.id} → #${r.target.id} (${r.how})`);
  console.log(`      ${r.amendment.title.slice(0, 74)}`);
  console.log(`   -> ${r.target.title.slice(0, 74)}`);
}

if (shaky.length > 0) {
  console.log(`\n${shaky.length} share no word with their target — check these first:`);
  for (const r of shaky) {
    console.log(`  #${r.amendment.id} (${r.how}) ${r.amendment.title.slice(0, 50)}`);
    console.log(`   -> #${r.target.id} ${r.target.title.slice(0, 50)}`);
  }
}
if (failed.length > 0) {
  console.log(`\nleft alone — link these by hand if they matter:`);
  for (const r of failed) console.log(`  #${r.amendment.id} [${r.how}] ${r.amendment.title.slice(0, 70)}`);
}

if (!APPLY) {
  console.log(`\n(dry run — pass --apply to write ${linked.length} edges)`);
  process.exit(0);
}

const insert = db.prepare(
  "INSERT OR IGNORE INTO note_links(source_id, target_id, source) VALUES (?, ?, 'amends')",
);
const write = db.transaction(() => {
  for (const r of linked) insert.run(r.amendment.id, r.target.id);
});
write();
console.log(`\n✓ wrote ${linked.length} amendment edges`);
