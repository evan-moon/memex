#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, relative } from 'node:path';
import { homedir } from 'node:os';

const usage = `Bring a vault back to the shape Obsidian and memex both expect.

  node scripts/normalize-vault.mjs [--vault <path>] [--db <path>] [--apply]

Three idempotent passes, in order:
  1. frontmatter  every note gets title/date/tags/layer, backfilled from the DB
  2. filename     slugged filenames become their title, so [[Title]] resolves
  3. folder       notes are filed by subject from their tags

Runs as a dry run unless --apply is passed. Re-running after new notes arrive
picks up only those notes.`;

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const VAULT = arg('--vault', join(homedir(), 'Documents', 'Second Brain')).replace(/\/$/, '');
const DB = arg('--db', join(homedir(), '.memex', 'memex.db'));
const APPLY = process.argv.includes('--apply');
const MAX_BYTES = 200;

if (!existsSync(VAULT)) {
  console.error(`vault not found: ${VAULT}`);
  process.exit(1);
}

const query = (sql) => JSON.parse(execFileSync('sqlite3', [DB, '-json', sql]).toString() || '[]');
const write = (statements) => {
  if (statements.length === 0) return;
  execFileSync('sqlite3', [DB], { input: `begin;\n${statements.join('\n')}\ncommit;\n` });
};
const sqlPath = (p) => `'${p.replace(/'/g, "''")}'`;
// Agents write to this vault while the script runs, so a row can outlive its
// file. Those are stale until the next `memex index` prunes them — skipping
// beats crashing halfway through a pass.
const notes = () =>
  query(
    `select id, file_path, title, tags, layer, authored_at from notes where file_path like '${VAULT}%' order by id`,
  ).filter((row) => existsSync(row.file_path));

const parseTags = (raw) => {
  try {
    const value = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? value.filter((t) => typeof t === 'string' && t.length > 0) : [];
  } catch {
    return [];
  }
};

const needsQuote = (value) => /[:#[\]{}&*!|>'"%@`,]|^\s|\s$/.test(value);
const yamlString = (value) =>
  needsQuote(value) ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value;

// An unquoted title starting with `[` or carrying a colon is not valid YAML, so
// Obsidian gives up on the whole block and renders it as body text. Re-quoting
// the scalar is what makes the properties parse again.
const QUOTED_SCALAR = /^\s*(['"]).*\1\s*$/;
const requoteScalars = (frontmatter) =>
  frontmatter
    .split('\n')
    .map((line) => {
      const match = line.match(/^(title|aliases):[ \t]*(.*)$/);
      if (!match) return line;
      const [, key, raw] = match;
      const value = raw.trim();
      if (value.length === 0 || QUOTED_SCALAR.test(value)) return line;
      if (key === 'aliases') {
        if (!(value.startsWith('[') && value.endsWith(']'))) return `aliases: [${yamlString(value)}]`;
        // Split on top-level commas only: an alias is usually a note title, and
        // titles contain commas, so a naive split would fuse or shred entries.
        const items = [];
        let depth = 0;
        let quote = '';
        let buffer = '';
        for (const ch of value.slice(1, -1)) {
          if (quote) {
            buffer += ch;
            if (ch === quote && !buffer.endsWith(`\\${ch}`)) quote = '';
            continue;
          }
          if (ch === '"' || ch === "'") quote = ch;
          if (ch === '[') depth++;
          if (ch === ']') depth--;
          if (ch === ',' && depth === 0) {
            items.push(buffer);
            buffer = '';
            continue;
          }
          buffer += ch;
        }
        items.push(buffer);
        const quoted = items
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => (QUOTED_SCALAR.test(item) ? item : yamlString(item)));
        return quoted.length > 0 ? `aliases: [${quoted.join(', ')}]` : line;
      }
      return `${key}: ${yamlString(value)}`;
    })
    .join('\n');

// macOS stores filenames decomposed (NFD) while titles from the DB are composed,
// so every path comparison normalizes or identical paths look different.
const nfc = (value) => value.normalize('NFC');
const relOf = (p) => nfc(relative(VAULT, p));

const readTitle = (filePath, fallback) => {
  const content = readFileSync(filePath, 'utf8');
  if (!content.startsWith('---')) return { title: fallback, content };
  const end = content.indexOf('\n---', 3);
  const match = content.slice(3, end).match(/^title:\s*(.+?)\s*$/m);
  if (!match) return { title: fallback, content };
  const raw = match[1].trim();
  const quoted =
    (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
  return {
    title: quoted ? raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\') : raw,
    content,
  };
};

const backfillFrontmatter = () => {
  const stats = { added: 0, patched: 0, requoted: 0, ok: 0 };
  for (const row of notes()) {
    const content = readFileSync(row.file_path, 'utf8');
    const date = new Date(row.authored_at ?? statSync(row.file_path).mtimeMs)
      .toISOString()
      .slice(0, 10);
    const tags = parseTags(row.tags);
    const tagsLine = tags.length > 0 ? `\ntags: [${tags.join(', ')}]` : '';

    if (!content.startsWith('---')) {
      const frontmatter = `---\ntitle: ${yamlString(row.title)}\ndate: ${date}${tagsLine}\nlayer: ${row.layer}\n---\n\n`;
      if (APPLY) writeFileSync(row.file_path, frontmatter + content);
      stats.added++;
      continue;
    }

    const end = content.indexOf('\n---', 3);
    const frontmatter = content.slice(3, end);
    const quoted = requoteScalars(frontmatter);
    if (/^date:/m.test(frontmatter)) {
      if (quoted === frontmatter) {
        stats.ok++;
        continue;
      }
      if (APPLY) writeFileSync(row.file_path, `---${quoted}${content.slice(end)}`);
      stats.requoted++;
      continue;
    }
    const patched = `---${quoted
      .replace(/\n?^category:.*$/m, '')
      .trimEnd()}\ndate: ${date}${tagsLine}\nlayer: ${row.layer}${content.slice(end)}`;
    if (APPLY) writeFileSync(row.file_path, patched);
    stats.patched++;
  }
  return stats;
};

const sanitize = (title) => {
  const cleaned = title
    .replace(/\//g, '／')
    .replace(/[<>:"\\|?*#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const buf = Buffer.from(cleaned, 'utf8');
  if (buf.byteLength <= MAX_BYTES) return cleaned;
  return Buffer.from(buf.subarray(0, MAX_BYTES)).toString('utf8').replace(/\uFFFD+$/, '').trim();
};

// A slugged stem is what breaks Obsidian: no spaces, hyphen-joined, while every
// wiki link addresses the human title. Stems that already read as prose are left
// alone — renaming them to a date-less title would collapse distinct notes.
const isSlug = (stem) => !stem.includes(' ') && stem.includes('-');

// An alias only earns its place when the filename cannot carry the exact title;
// otherwise `[[Title]]` already resolves and the key is noise.
const withAlias = (content, title, stem) => {
  if (nfc(stem) === nfc(title)) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1 || /^aliases:/m.test(content.slice(3, end))) return content;
  return `---${content.slice(3, end)}\naliases: [${yamlString(title)}]${content.slice(end)}`;
};

const renameToTitle = () => {
  const stats = { renamed: 0, aliased: 0, kept: 0 };
  const updates = [];
  const taken = new Set();

  for (const row of notes()) {
    const stem = basename(row.file_path, '.md');
    const { title, content } = readTitle(row.file_path, stem);
    const dir = dirname(row.file_path);

    const base = isSlug(nfc(stem)) ? sanitize(title) || stem : stem;
    const target = (() => {
      const first = join(dir, `${base}.md`);
      if (nfc(first) === nfc(row.file_path)) return first;
      if (!taken.has(nfc(first)) && !existsSync(first)) return first;
      for (let n = 2; ; n++) {
        const candidate = join(dir, `${base} (${n}).md`);
        if (!taken.has(nfc(candidate)) && !existsSync(candidate)) return candidate;
      }
    })();
    taken.add(nfc(target));

    const aliased = withAlias(content, title, basename(target, '.md'));
    if (aliased !== content) {
      if (APPLY) writeFileSync(row.file_path, aliased);
      stats.aliased++;
    }
    if (nfc(target) === nfc(row.file_path)) {
      stats.kept++;
      continue;
    }
    if (APPLY) renameSync(row.file_path, target);
    updates.push(`update notes set file_path = ${sqlPath(target)} where id = ${row.id};`);
    stats.renamed++;
  }
  if (APPLY) write(updates);
  return stats;
};

const PROJECT_TAGS = [
  ['opula', 'projects/opula'],
  ['firma-cloud', 'projects/firma'],
  ['firma-book', 'projects/firma'],
  ['firma', 'projects/firma'],
  ['memex', 'projects/memex'],
  ['herald', 'projects/herald'],
  ['argus', 'projects/herald'],
  ['skope', 'projects/skope'],
  ['swedenlift', 'projects/swedenlift'],
  ['스웨덴리프트', 'projects/swedenlift'],
  ['quotalab', 'work/quotalab'],
  ['쿼타랩', 'work/quotalab'],
];
// 'second-brain' is memex's own subject, not an agent-team marker — leaving it
// here filed memex.md and skope.md under the agent team instead of their projects.
const AGENT_TAGS = ['claude-code', 'multi-agent', 'session-handoff', 'skill'];
const PEOPLE_TAGS = ['coffee-chat', '커피챗', '1on1'];
const INVEST_TAGS = ['investment', 'finance', 'fire', 'portfolio', 'housing', '투자', '부동산', '주거', 'tsla', 'etf', '자산배분'];
const TOSS_TAGS = ['toss', '토스', 'hr', 'hiring', 'staffing', 'f-lead', 'organization', '채용'];
const CODING_TAGS = ['code-style', 'coding', 'rules', 'functional-programming'];
const LEARNING_TAGS = ['regex', 'tutorial', 'haskell'];
const PERSONAL_TAGS = ['self-improvement', 'philosophy', 'habit', 'productivity', 'hardware', 'health', 'family', '결혼', 'travel'];
const WRITING_TAGS = ['blog', 'essay', 'writing', 'idea', '글쓰기', 'draft', 'copywriting'];

const TITLE_RULES = [
  [/에이전트 팀|스킬 제작|memex 검색 규칙|노트 캡처 포맷|second brain|메모리 시스템|MCP 설계 원칙/i, 'projects/agent-team'],
  [/코드 스타일|코딩 원칙/, 'coding'],
  [/블로그 글쓰기/, 'writing/style'],
  [/결혼|상견례|신혼여행|심리상태|자존감|상담일지|생일선물|정형외과|가족|행복론/, 'personal'],
];

const CANONICAL = /^(projects|work|investing|writing|learning|coding|personal)\//;

// Every rule keys off tags or title, never the current folder: a folder-keyed
// rule stops matching once the note moves, so a second run would scatter what
// the first run had just filed correctly.
const destinationOf = (row) => {
  const tags = parseTags(row.tags).map((t) => t.toLowerCase());
  const title = nfc(row.title);
  const rel = relOf(row.file_path);
  const has = (list) => list.some((t) => tags.includes(t));

  // Mirrored Claude memory keeps its own subfolder: it is machine-written,
  // slug-titled, and re-synced by import-claude-memory, so it should not be
  // interleaved with the notes a human wrote about the same project.
  if (has(['claude-memory'])) {
    for (const [tag, dest] of PROJECT_TAGS) if (tags.includes(tag)) return `${dest}/memory`;
    if (has(['blog'])) return 'writing/memory';
    return 'projects/agent-team/memory';
  }

  if (has(['category-theory', 'ctfp'])) return 'learning/Category Theory';
  if (has(['regex', '정규식'])) return 'learning/정규식';
  if (has(['면접'])) return 'work/interviews';
  if (has(['ebook']) && /^(\d장\.|마치며|부록|하루 5분)/.test(title)) return 'projects/firma/ebook';
  if (/^블로그 글쓰기/.test(title)) return 'writing/style';
  if (has(AGENT_TAGS)) return 'projects/agent-team';

  for (const [tag, dest] of PROJECT_TAGS) if (tags.includes(tag)) return dest;

  const person = title.match(/^([가-힣]{2,4})님/)?.[1] ?? null;
  if (person && has(PEOPLE_TAGS)) return `work/people/${person}`;
  if (has(PEOPLE_TAGS)) return 'work/people';
  if (has(INVEST_TAGS)) return 'investing';
  if (has(TOSS_TAGS)) return 'work/toss';
  if (has(CODING_TAGS)) return 'coding';
  if (has(LEARNING_TAGS)) return 'learning';
  for (const [pattern, dest] of TITLE_RULES) if (pattern.test(title)) return dest;
  if (has(PERSONAL_TAGS)) return 'personal';
  if (has(WRITING_TAGS)) return 'writing';
  if (person) return `work/people/${person}`;
  if (CANONICAL.test(rel)) return dirname(rel);
  return 'writing';
};

const fileByFolder = () => {
  const rows = notes();
  const counts = new Map();
  for (const row of rows) {
    const dest = destinationOf(row);
    counts.set(dest, (counts.get(dest) ?? 0) + 1);
  }

  // A person folder holding a single note is noise; those sit in work/people.
  const resolve = (dest) => {
    const person = dest.match(/^work\/people\/(.+)$/);
    return person && counts.get(dest) < 2 ? 'work/people' : dest;
  };

  const moves = rows
    .map((row) => ({
      row,
      to: join(VAULT, resolve(destinationOf(row)), basename(row.file_path)),
    }))
    .filter(({ row, to }) => nfc(to) !== nfc(row.file_path));

  const updates = [];
  const tree = new Map();
  for (const { row, to } of moves) {
    const dest = relOf(dirname(to));
    tree.set(dest, (tree.get(dest) ?? 0) + 1);
    if (!APPLY) continue;
    mkdirSync(dirname(to), { recursive: true });
    const target = existsSync(to) ? to.replace(/\.md$/, ' (2).md') : to;
    renameSync(row.file_path, target);
    updates.push(`update notes set file_path = ${sqlPath(target)} where id = ${row.id};`);
  }
  if (APPLY) write(updates);
  return { moved: moves.length, tree };
};

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}  vault=${VAULT}\n`);
console.log('1. frontmatter :', JSON.stringify(backfillFrontmatter()));
console.log('2. filename    :', JSON.stringify(renameToTitle()));
const folders = fileByFolder();
console.log('3. folder      :', JSON.stringify({ moved: folders.moved }));
for (const [dest, n] of [...folders.tree].sort()) console.log(`     ${String(n).padStart(4)}  ${dest}`);
if (!APPLY) console.log('\nnothing written — re-run with --apply');
else console.log('\nrun `memex index --force` to refresh categories and embeddings');
