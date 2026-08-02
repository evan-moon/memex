#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';
import { homedir } from 'node:os';

const usage = `Repoint wiki links whose target note was renamed after the link was written.

  node scripts/repair-links.mjs [--vault <path>] [--min-ratio 0.85] [--apply]

Only rewrites a link when exactly one note matches well above every runner-up.
Everything below the bar is listed for a human to judge, never guessed at.`;

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const VAULT = arg('--vault', join(homedir(), 'Documents', 'Second Brain')).replace(/\/$/, '');
const MIN_RATIO = Number(arg('--min-ratio', '0.85'));
const MARGIN = 0.05;
const APPLY = process.argv.includes('--apply');

const walk = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (extname(entry.name) === '.md') out.push(full);
  }
  return out;
};

const files = await walk(VAULT);
const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

const titleById = new Map(
  JSON.parse(
    execFileSync('sqlite3', [
      join(homedir(), '.memex', 'memex.db'),
      '-json',
      `select id, title from notes where file_path like '${VAULT}%'`,
    ]).toString() || '[]',
  ).map((r) => [String(r.id), r.title]),
);

const NOTION_UUID = /\s*[0-9a-f]{32}$/i;

// Only `[[Title]]` is a link in Obsidian. The other three shapes agents kept
// writing render as literal text: a `(#id)` tail after a wiki link, a bare id,
// and Notion's exported percent-encoded relative paths.
const normalizeSyntax = (content) => {
  const counts = { idTail: 0, idLink: 0, notionPath: 0 };
  const next = content
    .replace(/(\[\[[^[\]]+?\]\])\(#\d+\)/g, (_, link) => {
      counts.idTail++;
      return link;
    })
    .replace(/\[\[(\d+)\]\]/g, (whole, id) => {
      const title = titleById.get(id);
      if (!title) return whole;
      counts.idLink++;
      return `[[${title}]]`;
    })
    .replace(/\[([^\]]*)\]\(([^)\s]+\.md)\)/g, (whole, label, target) => {
      if (/^https?:\/\//.test(target)) return whole;
      const decoded = decodeURIComponent(target).replace(/\\/g, '/');
      const clean = decoded.split('/').pop().replace(/\.md$/, '').replace(NOTION_UUID, '').trim();
      if (!clean) return whole;
      counts.notionPath++;
      return label && label !== clean ? `[[${clean}|${label}]]` : `[[${clean}]]`;
    });
  return { next, counts };
};

const syntax = { idTail: 0, idLink: 0, notionPath: 0 };
for (const [file, content] of texts) {
  const { next, counts } = normalizeSyntax(content);
  syntax.idTail += counts.idTail;
  syntax.idLink += counts.idLink;
  syntax.notionPath += counts.notionPath;
  if (next === content) continue;
  texts.set(file, next);
  if (APPLY) writeFileSync(file, next);
}
console.log(`syntax normalized: ${JSON.stringify(syntax)}\n`);

const aliasOf = (content) => {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  const match = content.slice(3, end).match(/^aliases:\s*\[(.+)\]\s*$/m);
  if (!match) return null;
  const raw = match[1].trim();
  return raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    : raw;
};

const resolvable = new Set();
const nameToFile = new Map();
for (const [file, content] of texts) {
  const stem = basename(file, '.md').normalize('NFC');
  resolvable.add(stem);
  nameToFile.set(stem, file);
  const alias = aliasOf(content);
  if (alias) {
    resolvable.add(alias.normalize('NFC'));
    nameToFile.set(alias.normalize('NFC'), file);
  }
}

// Obsidian resolves link targets case-insensitively, so [[Firma]] finding
// firma.md is not a broken link and must not be "repaired".
const resolvableLower = new Set([...resolvable].map((v) => v.toLowerCase()));

const LINK = /\[\[([^[\]]+?)\]\]/g;
const broken = new Map();
for (const content of texts.values()) {
  for (const match of content.matchAll(LINK)) {
    const target = match[1].split('|')[0].split('#')[0].trim().normalize('NFC');
    if (target && !resolvableLower.has(target.toLowerCase()))
      broken.set(target, (broken.get(target) ?? 0) + 1);
  }
}

// Ratio of the longest common subsequence to total length — close enough to
// difflib's SequenceMatcher for picking a renamed note out of a known pool.
const similarity = (a, b) => {
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 0) return 0;
  let prev = new Array(short.length + 1).fill(0);
  for (let i = 1; i <= long.length; i++) {
    const curr = new Array(short.length + 1).fill(0);
    for (let j = 1; j <= short.length; j++) {
      curr[j] = long[i - 1] === short[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return (2 * prev[short.length]) / (a.length + b.length);
};

const pool = [...resolvable];
const confident = new Map();
const uncertain = [];

// Links drift from titles in three mechanical ways, all recoverable without
// guessing: the link text was truncated (often with a trailing ellipsis), the
// note was later retitled by appending, or a prefix like "완료·대체됨 " was put
// in front of it. Comparing on a folded form catches all three — including the
// fullwidth solidus a title picks up when it becomes a filename.
const fold = (value) =>
  value
    .normalize('NFC')
    .toLowerCase()
    .replace(/／/g, '/')
    .replace(/[.·\s…]+$/u, '')
    .trim();

// Candidates are counted per note, not per string: a sanitized filename and the
// alias carrying its original title both name the SAME note, and treating them
// as two matches makes every such note fail the uniqueness test.
const foldedPool = [...nameToFile].map(([value, file]) => ({
  candidate: value,
  folded: fold(value),
  file,
}));

const uniqueByFile = (matches) => {
  const files = new Set(matches.map((m) => m.file));
  if (files.size !== 1) return null;
  return matches.reduce((a, b) => (a.candidate.length <= b.candidate.length ? a : b)).candidate;
};

const uniqueMatch = (target) => {
  const folded = fold(target);
  if (folded.length < 8) return null;

  const exact = uniqueByFile(foldedPool.filter((c) => c.folded === folded));
  if (exact) return { pick: exact, why: 'folded' };

  const prefixed = uniqueByFile(
    foldedPool.filter((c) => c.folded !== folded && c.folded.startsWith(folded)),
  );
  if (prefixed) return { pick: prefixed, why: 'prefix' };

  // A containment match is looser, so it needs the target to carry real signal:
  // short fragments would match half the vault.
  if (folded.length >= 16) {
    const contained = uniqueByFile(
      foldedPool.filter((c) => c.folded !== folded && c.folded.includes(folded)),
    );
    if (contained) return { pick: contained, why: 'contains' };
  }

  // Retitles that grow in the middle ("완료·대체됨 X (date, 종결)" for "X (date)")
  // break every substring rule, but the note is still pinned by two independent
  // anchors: a long shared opening and the same ISO date.
  const date = folded.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const head = folded.replace(/\s*\(?\d{4}-\d{2}-\d{2}.*$/, '').trim();
  if (date && head.length >= 12) {
    const anchored = uniqueByFile(
      foldedPool.filter((c) => c.folded !== folded && c.folded.includes(head) && c.folded.includes(date)),
    );
    if (anchored) return { pick: anchored, why: 'head+date' };
  }
  return null;
};

for (const [target, count] of [...broken].sort((a, b) => b[1] - a[1])) {
  const ranked = pool
    .map((candidate) => ({ candidate, ratio: similarity(target, candidate) }))
    .sort((a, b) => b.ratio - a.ratio);
  const [best, runnerUp] = ranked;
  const structural = uniqueMatch(target);
  const pick =
    structural?.pick ??
    (best && best.ratio >= MIN_RATIO && best.ratio - (runnerUp?.ratio ?? 0) > MARGIN
      ? best.candidate
      : null);
  if (pick) {
    confident.set(target, pick);
    const why = structural?.why ?? best.ratio.toFixed(2);
    console.log(`fix  ${count}x  ${why}  ${target}\n            -> ${pick}`);
  } else {
    uncertain.push({ target, count, best: best?.candidate, ratio: best?.ratio ?? 0 });
  }
}

let rewritten = 0;
if (APPLY && confident.size > 0) {
  for (const [file, content] of texts) {
    const next = content.replace(LINK, (whole, inner) => {
      const [head, label] = inner.split('|');
      const [target, anchor] = head.split('#');
      const replacement = confident.get(target.trim().normalize('NFC'));
      if (!replacement) return whole;
      rewritten++;
      return `[[${replacement}${anchor ? `#${anchor}` : ''}${label ? `|${label}` : ''}]]`;
    });
    if (next !== content) writeFileSync(file, next);
  }
}

console.log(`\nbroken targets: ${broken.size} | repaired: ${confident.size} | left: ${uncertain.length}`);
if (APPLY) console.log(`link occurrences rewritten: ${rewritten}`);
else console.log('nothing written — re-run with --apply');

console.log('\n--- left for review (top 20 by usage) ---');
for (const u of uncertain.slice(0, 20)) {
  const hint = u.ratio > 0.5 ? `  ~ ${u.best} (${u.ratio.toFixed(2)})` : '';
  console.log(`  ${String(u.count).padStart(2)}x  ${u.target}${hint}`);
}
