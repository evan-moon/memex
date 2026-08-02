#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

const usage = `Copy Claude Code memory files into the vault so their [[slug]] links resolve.

  node scripts/import-claude-memory.mjs [--vault <path>] [--source <dir>] [--apply]

Memory stays where it is — the harness injects it into every session and
deleting it would cost the agents that context. This mirrors it into memex as
the searchable, linkable layer. The note title IS the memory slug, because
that is what every existing link addresses.`;

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const VAULT = arg('--vault', join(homedir(), 'Documents', 'Second Brain')).replace(/\/$/, '');
const SOURCE = arg('--source', join(homedir(), '.claude', 'projects'));
const APPLY = process.argv.includes('--apply');

const FOLDER_BY_PROJECT = {
  '-Users-evan-dev-playground-opula': 'projects/opula/memory',
  '-Users-evan-dev-playground-firma': 'projects/firma/memory',
  '-Users-evan-dev-playground-firma-cloud': 'projects/firma/memory',
  '-Users-evan-dev-playground-firma-server': 'projects/firma/memory',
  '-Users-evan-dev-drafts-firma-book': 'projects/firma/memory',
  '-Users-evan-dev-playground-memex': 'projects/memex/memory',
  '-Users-evan-dev-playground-herald': 'projects/herald/memory',
  '-Users-evan-dev-playground-skope': 'projects/skope/memory',
  '-Users-evan-dev-swedenlift': 'projects/swedenlift/memory',
  '-Users-evan-dev-playground-evan-blog': 'writing/memory',
};
const DEFAULT_FOLDER = 'projects/agent-team/memory';

const TAG_BY_PROJECT = {
  '-Users-evan-dev-playground-opula': 'opula',
  '-Users-evan-dev-playground-firma': 'firma',
  '-Users-evan-dev-playground-firma-cloud': 'firma',
  '-Users-evan-dev-playground-firma-server': 'firma',
  '-Users-evan-dev-drafts-firma-book': 'firma',
  '-Users-evan-dev-playground-memex': 'memex',
  '-Users-evan-dev-playground-herald': 'herald',
  '-Users-evan-dev-playground-skope': 'skope',
  '-Users-evan-dev-swedenlift': 'swedenlift',
  '-Users-evan-dev-playground-evan-blog': 'blog',
};

const needsQuote = (value) => /[:#[\]{}&*!|>'"%@`,]|^\s|\s$/.test(value);
const yamlString = (value) =>
  needsQuote(value) ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value;

const unquote = (value) => {
  const raw = value.trim();
  return (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
    ? raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    : raw;
};

// The same three shapes normalize-vault strips from the vault also show up in
// memory bodies, since the same agents wrote both.
const normalizeLinks = (body) =>
  body
    .replace(/(\[\[[^[\]]+?\]\])\(#\d+\)/g, (_, link) => link)
    .replace(/\[([^\]]*)\]\(([^)\s]+\.md)\)/g, (whole, label, target) => {
      if (/^https?:\/\//.test(target)) return whole;
      const clean = decodeURIComponent(target)
        .split('/')
        .pop()
        .replace(/\.md$/, '')
        .replace(/\s*[0-9a-f]{32}$/i, '')
        .trim();
      return clean ? `[[${clean}]]` : whole;
    });

const parse = (filePath) => {
  const content = readFileSync(filePath, 'utf8');
  const end = content.indexOf('\n---', 3);
  if (!content.startsWith('---') || end === -1) return null;
  const frontmatter = content.slice(3, end);
  const body = content.slice(end + 4).replace(/^\n+/, '');
  const field = (key) => frontmatter.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm'))?.[1];
  // The filename is the key every [[link]] addresses; the `name:` field drifts
  // from it (and is sometimes blank or truncated), so it is not the title.
  return {
    slug: basename(filePath, '.md'),
    description: unquote(field('description') ?? ''),
    type: unquote(field('type') ?? 'project'),
    modified: unquote(field('modified') ?? ''),
    body,
  };
};

const projects = readdirSync(SOURCE, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(SOURCE, d.name, 'memory')))
  .map((d) => d.name);

const stats = { written: 0, skipped: 0, unchanged: 0 };
const byFolder = new Map();

for (const project of projects) {
  const dir = join(SOURCE, project, 'memory');
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md') || entry === 'MEMORY.md') continue;
    const sourcePath = join(dir, entry);
    const parsed = parse(sourcePath);
    if (!parsed) {
      stats.skipped++;
      continue;
    }

    const folder = FOLDER_BY_PROJECT[project] ?? DEFAULT_FOLDER;
    const projectTag = TAG_BY_PROJECT[project];
    const tags = ['claude-memory', parsed.type, projectTag].filter(Boolean);
    const date = new Date(parsed.modified || statSync(sourcePath).mtimeMs)
      .toISOString()
      .slice(0, 10);

    const lead = parsed.description ? `> ${parsed.description}\n\n` : '';
    const file = `---\ntitle: ${yamlString(parsed.slug)}\ndate: ${date}\ntags: [${tags.join(', ')}]\nlayer: state\n---\n\n# ${parsed.slug}\n\n${lead}${normalizeLinks(parsed.body)}`;

    const target = join(VAULT, folder, `${parsed.slug}.md`);
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);

    if (existsSync(target) && readFileSync(target, 'utf8') === file) {
      stats.unchanged++;
      continue;
    }
    if (APPLY) {
      mkdirSync(join(VAULT, folder), { recursive: true });
      writeFileSync(target, file);
    }
    stats.written++;
  }
}

console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}  ${JSON.stringify(stats)}\n`);
for (const [folder, n] of [...byFolder].sort()) console.log(`  ${String(n).padStart(4)}  ${folder}`);
if (!APPLY) console.log('\nnothing written — re-run with --apply');
else console.log('\nrun `memex index` to pick them up');
