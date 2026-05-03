# Memex Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 5개 기능을 memex에 추가한다 — 중복 감지, 날짜 필터, list_tags/list_folders MCP tools, 백링크 추적, Digest CLI.

**Architecture:** 모든 DB 관련 로직은 `packages/db/src/repository.ts`에 추가하고 `packages/db/src/index.ts`에서 export. MCP tool은 `apps/mcp/src/tools/` 아래 파일 하나씩. CLI command는 `apps/cli/src/commands/` 아래 파일 하나씩. 두 앱의 service 레이어(`apps/mcp/src/services/note.ts`, `apps/cli/src/services/note.ts`)는 내용이 동일하므로 변경이 생기면 두 파일 모두 반영.

**Tech Stack:** TypeScript, better-sqlite3, drizzle-orm, sqlite-vec, @modelcontextprotocol/sdk, commander

**Build command (모든 task 후):**
```bash
cd /Users/evan/dev/playground/memex && yarn workspace memex build
```

---

## Task 1: 중복/유사 노트 감지

save_note 호출 시 저장 전 임베딩 유사도로 비슷한 노트를 찾아 응답에 경고로 포함.

**Files:**
- Modify: `packages/db/src/repository.ts` — `findSimilarByEmbedding` 함수 추가
- Modify: `packages/db/src/index.ts` — 새 함수 export
- Modify: `apps/mcp/src/services/note.ts` — `saveNote`가 유사 노트 목록도 반환
- Modify: `apps/mcp/src/tools/save-note.ts` — 응답에 경고 포함

### Step 1: `findSimilarByEmbedding` repository 함수 작성

`packages/db/src/repository.ts` 끝에 추가:

```typescript
export type SimilarNote = Note & { distance: number };

export const findSimilarByEmbedding = (
  client: MemexClient,
  embedding: number[],
  threshold = 0.5,
  limit = 3,
  excludeId?: number,
): SimilarNote[] => {
  const vec = new Float32Array(embedding);
  const excludeFilter = excludeId !== undefined ? 'AND n.id != ?' : '';
  const excludeArgs = excludeId !== undefined ? [excludeId] : [];

  const rows = client.sqlite
    .prepare(
      `SELECT n.*, e.distance
       FROM note_embeddings e
       JOIN notes n ON n.id = e.note_id
       WHERE e.embedding MATCH ?
       AND k = ?
       ${excludeFilter}
       AND e.distance < ?
       ORDER BY e.distance`,
    )
    .all(Buffer.from(vec.buffer), limit * 2, ...excludeArgs, threshold) as SimilarNote[];

  return rows.slice(0, limit);
};
```

### Step 2: index.ts에서 export

`packages/db/src/index.ts`:
```typescript
export { ..., findSimilarByEmbedding } from './repository.ts';
export type { ..., SimilarNote } from './repository.ts';
```

현재 export 라인을 수정:
```typescript
export { insertNote, saveEmbedding, searchNotes, listNotes, countNotes, getNote, getNoteByFilePath, listNotesByPathPrefix, deleteNote, updateNote, parseTags, serializeTags, findRelatedNotes, findSimilarByEmbedding } from './repository.ts';
export type { RelatedNote, SimilarNote } from './repository.ts';
```

### Step 3: MCP `saveNote` 서비스 함수가 유사 노트를 반환하도록 수정

`apps/mcp/src/services/note.ts`의 `saveNote` 함수 시그니처와 반환 타입 변경:

```typescript
import {
  deleteNote,
  findSimilarByEmbedding,
  getNote,
  insertNote,
  parseTags,
  saveEmbedding,
  searchNotes as dbSearchNotes,
  serializeTags,
  updateNote,
  type MemexClient,
  type NoteSource,
  type SimilarNote,
} from '@memex/db';

export const saveNote = async (
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
  params: { title: string; content: string; source: NoteSource; folder?: string; tags?: string[] },
): Promise<{ note: ReturnType<typeof insertNote>; similar: SimilarNote[] }> => {
  const embedding = await embedder(buildEmbeddingText(params.title, params.content, params.folder, params.tags));
  const similar = findSimilarByEmbedding(client, embedding, 0.5, 3);

  const filePath = generateFilePath(vaultPath, params.title, params.folder);
  writeFileSync(filePath, `# ${params.title}\n\n${params.content}`, 'utf8');

  const category = extractCategory(params.folder);
  const tags = serializeTags(params.tags ?? []);
  const note = insertNote(client, { ...params, filePath, category: category ?? undefined, tags });
  saveEmbedding(client, note.id, embedding);

  return { note, similar };
};
```

> 임베딩을 저장 전에 먼저 계산해서 유사 노트를 찾고, 그 임베딩을 재사용해 저장. 중복 임베딩 계산 없음.

### Step 4: MCP `save-note.ts` 툴에서 경고 포함

`apps/mcp/src/tools/save-note.ts`:

```typescript
async ({ title, content, folder, tags, source }) => {
  const { note, similar } = await saveNote(client, embedder, vaultPath, {
    title,
    content,
    folder,
    tags,
    source: source as NoteSource,
  });

  let text = `Saved note #${note.id}: "${note.title}"`;

  if (similar.length > 0) {
    const list = similar
      .map((s) => `- #${s.id} "${s.title}" (distance: ${s.distance.toFixed(3)})`)
      .join('\n');
    text += `\n\n⚠️ Similar notes already exist — consider updating one instead:\n${list}`;
  }

  return { content: [{ type: 'text', text }] };
},
```

### Step 5: 빌드 및 확인

```bash
cd /Users/evan/dev/playground/memex && yarn workspace memex build
```

Expected: 빌드 성공, 타입 에러 없음.

### Step 6: 동작 테스트

MCP 서버에 `save_note`로 이미 있는 노트와 유사한 내용을 저장해보고 경고가 나오는지 확인:

```bash
# MCP 없이 CLI로도 새 노트를 추가해서 비슷한 게 이미 있는지 확인 가능
memex search "memex second brain"
```

### Step 7: Commit

```bash
git add packages/db/src/repository.ts packages/db/src/index.ts apps/mcp/src/services/note.ts apps/mcp/src/tools/save-note.ts
git commit -m "feat: warn on similar notes when saving via MCP"
```

---

## Task 2: 날짜 필터 검색

`search_notes` MCP tool과 CLI `search`에 `date_from` / `date_to` 파라미터 추가.

**Files:**
- Modify: `packages/db/src/repository.ts` — `searchNotes`에 날짜 파라미터 추가
- Modify: `apps/mcp/src/services/note.ts` — `semanticSearch`에 날짜 파라미터 전달
- Modify: `apps/cli/src/services/note.ts` — 동일
- Modify: `apps/mcp/src/tools/search-notes.ts` — 툴 파라미터 추가
- Modify: `apps/cli/src/commands/search.ts` — CLI 옵션 추가

### Step 1: `searchNotes` repository 함수에 날짜 파라미터 추가

`packages/db/src/repository.ts`의 `searchNotes` 시그니처:

```typescript
export const searchNotes = (
  client: MemexClient,
  query: string,
  embedding: number[],
  limit = 10,
  category?: string,
  tag?: string,
  dateFrom?: number,  // Unix ms
  dateTo?: number,    // Unix ms
): SearchResult[] => {
```

각 SQL 쿼리에 날짜 필터를 추가해야 하는데, 필터 조건이 여러 소스에 반복되므로 helper로 추출:

```typescript
// searchNotes 함수 상단에 추가
const dateFromFilter = dateFrom ? ' AND n.created_at >= ?' : '';
const dateToFilter = dateTo ? ' AND n.created_at <= ?' : '';
const dateFromFilterNoAlias = dateFrom ? ' AND created_at >= ?' : '';
const dateToFilterNoAlias = dateTo ? ' AND created_at <= ?' : '';
const dateArgs = [...(dateFrom ? [dateFrom] : []), ...(dateTo ? [dateTo] : [])];
```

Vector 쿼리 (n. alias 있음):
```typescript
const vectorResults = client.sqlite
  .prepare(
    `SELECT n.*, e.distance
     FROM note_embeddings e
     JOIN notes n ON n.id = e.note_id
     WHERE e.embedding MATCH ?
     AND k = ?
     ${aliasedCategoryFilter}
     ${aliasedTagFilter}
     ${dateFromFilter}
     ${dateToFilter}
     ORDER BY e.distance`,
  )
  .all(Buffer.from(vec.buffer), limit * 5, ...filterArgs, ...dateArgs) as SearchResult[];
```

FTS 쿼리 (n. alias 있음):
```typescript
const ftsResults = client.sqlite
  .prepare(
    `SELECT n.*
     FROM notes_fts
     JOIN notes n ON n.id = notes_fts.rowid
     WHERE notes_fts MATCH ?
     ${aliasedCategoryFilter}
     ${aliasedTagFilter}
     ${dateFromFilter}
     ${dateToFilter}
     ORDER BY bm25(notes_fts)
     LIMIT ?`,
  )
  .all(ftsQuery, ...filterArgs, ...dateArgs, limit * 3) as Note[];
```

Tag 쿼리 및 Title 쿼리 (alias 없음):
```typescript
// tag results: categoryFilter/tagFilter + dateFromFilterNoAlias/dateToFilterNoAlias
// title results: 동일
```

### Step 2: `semanticSearch` 서비스 함수에 날짜 파라미터 추가

두 파일(`apps/mcp/src/services/note.ts`, `apps/cli/src/services/note.ts`) 동일하게 수정:

```typescript
export const semanticSearch = async (
  client: MemexClient,
  embedder: Embedder,
  query: string,
  limit: number,
  category?: string,
  tag?: string,
  dateFrom?: number,
  dateTo?: number,
) => {
  const embedding = await embedder(query, 'query');
  return dbSearchNotes(client, query, embedding, limit, category, tag, dateFrom, dateTo);
};
```

### Step 3: MCP `search-notes.ts` 툴 파라미터 추가

```typescript
{
  query: z.string().describe('Search query in any language'),
  limit: z.number().int().min(1).max(20).optional().default(5),
  category: z.string().optional().describe('Filter by top-level folder'),
  tag: z.string().optional().describe('Filter by a single tag'),
  date_from: z
    .string()
    .optional()
    .describe('Filter notes created on or after this date (ISO 8601, e.g. "2026-04-01")'),
  date_to: z
    .string()
    .optional()
    .describe('Filter notes created on or before this date (ISO 8601, e.g. "2026-05-01")'),
},
async ({ query, limit, category, tag, date_from, date_to }) => {
  const dateFrom = date_from ? new Date(date_from).getTime() : undefined;
  const dateTo = date_to ? new Date(date_to).getTime() : undefined;
  const results = await semanticSearch(client, embedder, query, limit, category, tag, dateFrom, dateTo);
  ...
},
```

### Step 4: CLI `search.ts` 옵션 추가

```typescript
.option('--from <date>', 'Filter notes created on or after date (YYYY-MM-DD)')
.option('--to <date>', 'Filter notes created on or before date (YYYY-MM-DD)')
.action(async (query: string, opts: { limit: string; category?: string; tag?: string; from?: string; to?: string }) => {
  const dateFrom = opts.from ? new Date(opts.from).getTime() : undefined;
  const dateTo = opts.to ? new Date(opts.to).getTime() : undefined;
  const results = await semanticSearch(client, embedder, query, Number(opts.limit), opts.category, opts.tag, dateFrom, dateTo);
```

### Step 5: 빌드

```bash
cd /Users/evan/dev/playground/memex && yarn workspace memex build
```

### Step 6: 동작 테스트

```bash
memex search "memex" --from 2026-05-03 --to 2026-05-04
```

Expected: 해당 날짜 범위 내 노트만 반환.

### Step 7: Commit

```bash
git add packages/db/src/repository.ts apps/mcp/src/services/note.ts apps/cli/src/services/note.ts apps/mcp/src/tools/search-notes.ts apps/cli/src/commands/search.ts
git commit -m "feat: add date_from/date_to filter to search"
```

---

## Task 3: list_tags / list_folders MCP Tools

**Files:**
- Modify: `packages/db/src/repository.ts` — `listAllTags`, `listAllFolders` 추가
- Modify: `packages/db/src/index.ts` — export
- Create: `apps/mcp/src/tools/list-tags.ts`
- Create: `apps/mcp/src/tools/list-folders.ts`
- Modify: `apps/mcp/src/index.ts` — register

### Step 1: Repository 함수 추가

`packages/db/src/repository.ts` 끝에 추가:

```typescript
export type TagCount = { tag: string; count: number };

export const listAllTags = (client: MemexClient): TagCount[] =>
  client.sqlite
    .prepare(
      `SELECT t.value AS tag, COUNT(*) AS count
       FROM notes n, json_each(n.tags) t
       GROUP BY t.value
       ORDER BY count DESC, t.value ASC`,
    )
    .all() as TagCount[];

export type FolderCount = { folder: string; count: number };

export const listAllFolders = (client: MemexClient): FolderCount[] =>
  client.sqlite
    .prepare(
      `SELECT category AS folder, COUNT(*) AS count
       FROM notes
       WHERE category IS NOT NULL
       GROUP BY category
       ORDER BY count DESC, category ASC`,
    )
    .all() as FolderCount[];
```

### Step 2: index.ts export 추가

```typescript
export { ..., listAllTags, listAllFolders } from './repository.ts';
export type { ..., TagCount, FolderCount } from './repository.ts';
```

### Step 3: `apps/mcp/src/tools/list-tags.ts` 생성

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient } from '@memex/db';
import { listAllTags } from '@memex/db';

export const registerListTags = (server: McpServer, client: MemexClient) => {
  server.tool(
    'list_tags',
    'List all tags in the second brain with their note counts. Use this before saving a note to pick consistent existing tags rather than creating new ones.',
    {},
    async () => {
      const tags = listAllTags(client);
      if (tags.length === 0) {
        return { content: [{ type: 'text', text: 'No tags found.' }] };
      }
      const text = tags.map((t) => `${t.tag} (${t.count})`).join('\n');
      return { content: [{ type: 'text', text }] };
    },
  );
};
```

### Step 4: `apps/mcp/src/tools/list-folders.ts` 생성

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient } from '@memex/db';
import { listAllFolders } from '@memex/db';

export const registerListFolders = (server: McpServer, client: MemexClient) => {
  server.tool(
    'list_folders',
    'List all top-level folders (categories) in the second brain with their note counts. Use this before saving a note to pick the right folder.',
    {},
    async () => {
      const folders = listAllFolders(client);
      if (folders.length === 0) {
        return { content: [{ type: 'text', text: 'No folders found.' }] };
      }
      const text = folders.map((f) => `${f.folder} (${f.count})`).join('\n');
      return { content: [{ type: 'text', text }] };
    },
  );
};
```

### Step 5: `apps/mcp/src/index.ts`에 등록

```typescript
import { registerListTags } from './tools/list-tags.ts';
import { registerListFolders } from './tools/list-folders.ts';

// server 등록 이후
registerListTags(server, client);
registerListFolders(server, client);
```

### Step 6: 빌드

```bash
cd /Users/evan/dev/playground/memex && yarn workspace memex build
```

### Step 7: Commit

```bash
git add packages/db/src/repository.ts packages/db/src/index.ts apps/mcp/src/tools/list-tags.ts apps/mcp/src/tools/list-folders.ts apps/mcp/src/index.ts
git commit -m "feat: add list_tags and list_folders MCP tools"
```

---

## Task 4: Backlink 추적

노트 content에서 `[[Title]]` 패턴을 파싱해 `note_links` 테이블에 저장. `get_note` 응답에 `referenced_by` 포함.

**Files:**
- Modify: `packages/db/src/client.ts` — `note_links` 테이블 생성
- Modify: `packages/db/src/repository.ts` — `syncLinks`, `getBacklinks` 추가
- Modify: `packages/db/src/index.ts` — export
- Modify: `apps/mcp/src/services/note.ts` — saveNote, editNote에서 syncLinks 호출
- Modify: `apps/cli/src/services/note.ts` — 동일
- Modify: `apps/mcp/src/tools/get-note.ts` — referenced_by 포함

### Step 1: `note_links` 테이블을 `client.ts`에 추가

`packages/db/src/client.ts`의 `openDb` 함수 내, FTS5 테이블 생성 이전에 추가:

```typescript
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS note_links (
    source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    PRIMARY KEY (source_id, target_id)
  );
`);
```

### Step 2: Repository 함수 추가

`packages/db/src/repository.ts` 끝에 추가:

```typescript
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export const syncLinks = (client: MemexClient, sourceId: number, content: string): void => {
  client.sqlite.prepare('DELETE FROM note_links WHERE source_id = ?').run(sourceId);

  const titles = [...content.matchAll(WIKI_LINK_RE)].map((m) => m[1].trim());
  if (titles.length === 0) return;

  const insert = client.sqlite.prepare(
    'INSERT OR IGNORE INTO note_links(source_id, target_id) VALUES (?, ?)',
  );
  const findByTitle = client.sqlite.prepare(
    'SELECT id FROM notes WHERE lower(title) = lower(?) LIMIT 1',
  );

  for (const title of titles) {
    const row = findByTitle.get(title) as { id: number } | undefined;
    if (row) insert.run(sourceId, row.id);
  }
};

export const getBacklinks = (client: MemexClient, targetId: number): Note[] => {
  return client.sqlite
    .prepare(
      `SELECT n.* FROM note_links l
       JOIN notes n ON n.id = l.source_id
       WHERE l.target_id = ?
       ORDER BY n.updated_at DESC`,
    )
    .all(targetId) as Note[];
};
```

### Step 3: index.ts export

```typescript
export { ..., syncLinks, getBacklinks } from './repository.ts';
```

### Step 4: 두 service 파일 모두 syncLinks 호출

`apps/mcp/src/services/note.ts`와 `apps/cli/src/services/note.ts` 동일하게:

Import에 추가:
```typescript
import {
  ...,
  syncLinks,
  getBacklinks,
} from '@memex/db';
```

`saveNote` 내부, `saveEmbedding` 호출 이후:
```typescript
syncLinks(client, note.id, params.content);
```

`editNote` 내부, `saveEmbedding` 호출 이후:
```typescript
syncLinks(client, id, content);
```

### Step 5: MCP `get-note.ts` — referenced_by 포함

```typescript
import { getNote, getBacklinks } from '@memex/db';

async ({ id }) => {
  const note = getNote(client, id);
  if (!note) {
    return { content: [{ type: 'text', text: `Note #${id} not found.` }] };
  }

  const backlinks = getBacklinks(client, id);
  const backlinkSection =
    backlinks.length > 0
      ? `\n\n---\n**Referenced by:**\n${backlinks.map((b) => `- #${b.id} [[${b.title}]]`).join('\n')}`
      : '';

  const text = `# ${note.title}\n\n${note.content}${backlinkSection}\n\n---\nid: ${note.id} | source: ${note.source} | created: ${new Date(note.createdAt).toLocaleDateString()}`;
  return { content: [{ type: 'text', text }] };
},
```

### Step 6: 빌드

```bash
cd /Users/evan/dev/playground/memex && yarn workspace memex build
```

### Step 7: Commit

```bash
git add packages/db/src/client.ts packages/db/src/repository.ts packages/db/src/index.ts apps/mcp/src/services/note.ts apps/cli/src/services/note.ts apps/mcp/src/tools/get-note.ts
git commit -m "feat: track backlinks via [[Title]] syntax, show referenced_by in get_note"
```

---

## Task 5: Daily/Weekly Digest CLI

`memex digest [--days N] [--week]` — 최근 N일간 저장된 노트를 폴더별로 그루핑해 마크다운 요약.

**Files:**
- Modify: `packages/db/src/repository.ts` — `listNotesSince` 추가
- Modify: `packages/db/src/index.ts` — export
- Create: `apps/cli/src/commands/digest.ts`
- Modify: `apps/cli/src/index.ts` — 등록

### Step 1: `listNotesSince` repository 함수

`packages/db/src/repository.ts` 끝에 추가:

```typescript
export const listNotesSince = (client: MemexClient, sinceMs: number): Note[] =>
  client.sqlite
    .prepare('SELECT * FROM notes WHERE created_at >= ? ORDER BY created_at DESC')
    .all(sinceMs) as Note[];
```

### Step 2: index.ts export

```typescript
export { ..., listNotesSince } from './repository.ts';
```

### Step 3: `apps/cli/src/commands/digest.ts` 생성

```typescript
import type { Command } from 'commander';
import pc from 'picocolors';
import { openDb, listNotesSince, parseTags } from '@memex/db';
import { CONFIG_DIR, formatDate } from '@memex/utils';

export const registerDigest = (program: Command) => {
  program
    .command('digest')
    .description('Summarize notes saved in the last N days, grouped by folder')
    .option('-d, --days <n>', 'Number of days to look back', '7')
    .option('-w, --week', 'Shorthand for --days 7')
    .action((opts: { days: string; week?: boolean }) => {
      const days = opts.week ? 7 : Number(opts.days);
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const sinceDate = formatDate(new Date(sinceMs));

      const client = openDb(CONFIG_DIR);
      const notesResult = listNotesSince(client, sinceMs);

      if (notesResult.length === 0) {
        console.log(pc.dim(`No notes saved in the last ${days} day(s).`));
        return;
      }

      // Group by category (folder)
      const groups = new Map<string, typeof notesResult>();
      for (const note of notesResult) {
        const key = note.category ?? '(root)';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(note);
      }

      console.log();
      console.log(pc.bold(`Digest: last ${days} day(s) since ${sinceDate}`));
      console.log(pc.dim(`${notesResult.length} note(s) across ${groups.size} folder(s)\n`));

      for (const [folder, folderNotes] of groups) {
        console.log(pc.bold(pc.cyan(`## ${folder}`)));
        for (const note of folderNotes) {
          const date = formatDate(new Date(note.createdAt));
          const tags = parseTags(note.tags);
          const tagStr = tags.length > 0 ? pc.dim(` [${tags.join(', ')}]`) : '';
          console.log(`  ${pc.bold(`#${note.id}`)} ${note.title}${tagStr}  ${pc.dim(date)}`);
        }
        console.log();
      }
    });
};
```

### Step 4: `apps/cli/src/index.ts`에 등록

Import 추가:
```typescript
import { registerDigest } from './commands/digest.ts';
```

`program.parse()` 이전에:
```typescript
registerDigest(program);
```

### Step 5: 빌드

```bash
cd /Users/evan/dev/playground/memex && yarn workspace memex build
```

### Step 6: 동작 테스트

```bash
memex digest --days 3
memex digest --week
```

Expected: 최근 N일간의 노트를 폴더별로 그루핑해 출력.

### Step 7: Commit

```bash
git add packages/db/src/repository.ts packages/db/src/index.ts apps/cli/src/commands/digest.ts apps/cli/src/index.ts
git commit -m "feat: add digest CLI command for daily/weekly note summary"
```

---

## 완료 후 체크리스트

- [ ] Task 1: `save_note` 호출 시 유사 노트 경고 포함
- [ ] Task 2: `search_notes`에 `date_from`/`date_to` 필터 작동
- [ ] Task 3: `list_tags`, `list_folders` MCP tool 등록 및 응답 확인
- [ ] Task 4: `[[Title]]` 포함 노트 저장 후 `get_note`에서 `referenced_by` 노출
- [ ] Task 5: `memex digest --week` 실행 시 폴더별 요약 출력
- [ ] 전체 빌드 성공: `yarn workspace memex build`

## 주의사항

- **두 service 파일 동기화**: `apps/mcp/src/services/note.ts`와 `apps/cli/src/services/note.ts`는 내용이 동일하므로 변경 시 반드시 두 파일 모두 수정.
- **DB migration**: `note_links` 테이블은 `CREATE TABLE IF NOT EXISTS`로 추가되므로 기존 DB에서 자동으로 생성됨. 기존 노트들은 backlink가 없지만, 이후 update_note를 호출하면 syncLinks가 실행됨.
- **빌드**: `yarn workspace memex build`는 turbo를 통해 deps 순서대로 전체 빌드. packages/db 변경 후 반드시 실행.
