# Flashback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** save_note 직후 + search_notes 결과 하단에 **시간·맥락이 떨어진 과거 노트와의 의외 연결**을 자동 surface한다. memex의 진짜 moat인 cross-pollination을 강제 가시화.

**Why (from [[Memex Second Brain 방향성 논의 (Gemini 2R, 2026-05-24)]]):**
> 데이터 축적량이 아니라 "데이터 사이의 맥락적 연결 강도"가 본질. "어제 고민이 3개월 전 실패한 가설과 연결됨"을 짚어주는 것 — 그게 second brain의 존재 이유.

**Architecture:** save 또는 search 시점에 vector 인접도 + 시간 갭 ≥ 90일 + 다른 폴더라는 3축 SQL 한 방으로 후보 추출. LLM 호출 0회. 결과를 (a) 응답 텍스트에 inline surface + (b) `note_links` 테이블에 `source='flashback'` 으로 자동 백링크 저장. 사용자의 `[[wikilink]]`(source='wiki')와 구분.

**Out of scope:**
- LLM 기반 synthesis (이번엔 retrieval만, 합성은 v3)
- 사용자 onboarding / 첫 dismiss UX
- Reuse Rate 자동 측정 (수동 관찰)
- Decision Capture 넛지 (별도 plan)

**Tech Stack:** TypeScript, better-sqlite3, sqlite-vec, vitest.

**Build command:**
```bash
cd /Users/evan/dev/playground/memex && yarn workspace @evan-moon/memex build
```

---

## 디자인 결정 요약

| 결정 | 선택 | 이유 |
|---|---|---|
| 트리거 | save_note 직후 + search_notes 응답 하단 | 두 표면이 사용자가 항상 거치는 길목 |
| 알고리즘 | vector + 시간 갭 + 카테고리 다름 3축 (LLM 0회) | 비용 0, 결정론적 |
| 시간 갭 | 기본 90일 (env `MEMEX_FLASHBACK_DAYS=90`) | Gemini 권장값 |
| Distance threshold | 기본 0.4 (env `MEMEX_FLASHBACK_DIST=0.4`) | false positive 노이즈 컨트롤 |
| 결과 수 | 최대 3개 | 노이즈 회피 |
| 저장 | `note_links.source` 컬럼 추가 (`'wiki'` \| `'flashback'`) | 시스템 생성 백링크와 사용자 wikilink 구분 |
| UX 문구 | `[Flashback] 124일 전, 'X' 노트와 N% 유사 (#id)` | 짧고 정보 밀도 높게 |

---

## Task 1: schema 확장 — `note_links.source`

**Files:**
- Modify: `packages/db/src/client.ts` (CREATE TABLE + 마이그레이션)
- Modify: `packages/db/src/repository.ts` (`syncLinks` 가 source='wiki' 명시)

**Step 1: client.ts CREATE TABLE 갱신**

```sql
CREATE TABLE IF NOT EXISTS note_links (
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  source    TEXT    NOT NULL DEFAULT 'wiki',
  PRIMARY KEY (source_id, target_id, source)
);
```

**Step 2: 기존 DB 마이그레이션 (멱등)**

```ts
const linkCols = sqlite.prepare("PRAGMA table_info(note_links)").all() as { name: string }[];
if (!linkCols.some((c) => c.name === 'source')) {
  sqlite.exec(`
    ALTER TABLE note_links ADD COLUMN source TEXT NOT NULL DEFAULT 'wiki';
  `);
  // PK 변경은 SQLite에서 비파괴적으로 불가 → 그대로 두고 INSERT OR IGNORE 로직에서 처리
}
```

**Step 3: `syncLinks` 가 source='wiki' 명시**

```ts
const insert = client.sqlite.prepare(
  "INSERT OR IGNORE INTO note_links(source_id, target_id, source) VALUES (?, ?, 'wiki')",
);
```

**Step 4: 테스트 — 마이그레이션 + insert**

```ts
// packages/db/src/repository.test.ts 에 추가
it('note_links has source column with wiki default', () => {
  const cols = client.sqlite.prepare("PRAGMA table_info(note_links)").all() as { name: string; dflt_value: string }[];
  const sourceCol = cols.find((c) => c.name === 'source');
  expect(sourceCol?.dflt_value).toContain('wiki');
});
```

**Step 5: 실행 + commit**

```bash
yarn test packages/db
yarn workspace @memex/db build
git add packages/db
git commit -m "feat(db): add source column to note_links (wiki vs flashback)"
```

---

## Task 2: `findFlashbacks` 함수 + 테스트

**Files:**
- Modify: `packages/db/src/repository.ts`
- Modify: `packages/db/src/index.ts` (export)
- Modify: `packages/db/src/repository.test.ts`

**Step 1: 시그니처 + 시그널 정의**

```ts
// repository.ts
export type Flashback = Note & {
  distance: number;
  daysAgo: number;
};

export type FlashbackOptions = {
  minDaysGap?: number;   // default 90
  maxDistance?: number;  // default 0.4
  limit?: number;        // default 3
};

export const findFlashbacks = (
  client: MemexClient,
  noteId: number,
  embedding: number[],
  now: number,
  options: FlashbackOptions = {},
): Flashback[] => {
  const minDaysGap = options.minDaysGap ?? 90;
  const maxDistance = options.maxDistance ?? 0.4;
  const limit = options.limit ?? 3;
  const cutoff = now - minDaysGap * 86_400_000;

  const source = client.db.select().from(notes).where(eq(notes.id, noteId)).get();
  const sourceCategory = source?.category ?? null;

  const vec = new Float32Array(embedding);
  const categoryFilter = sourceCategory
    ? 'AND (n.category IS NULL OR n.category != ?)'
    : '';
  const args: (number | Buffer | string)[] = [Buffer.from(vec.buffer), limit * 5, noteId, cutoff, maxDistance];
  if (sourceCategory) args.push(sourceCategory);

  const rows = client.sqlite
    .prepare(`
      SELECT n.*, e.distance
      FROM note_embeddings e
      JOIN notes n ON n.id = e.note_id
      WHERE e.embedding MATCH ?
        AND k = ?
        AND n.id != ?
        AND n.created_at < ?
        AND e.distance < ?
        ${categoryFilter}
      ORDER BY e.distance
      LIMIT ${limit}
    `)
    .all(...args) as (Note & { distance: number })[];

  return rows.map((r) => ({
    ...r,
    daysAgo: Math.floor((now - r.createdAt) / 86_400_000),
  }));
};
```

**Step 2: 테스트 작성**

```ts
// repository.test.ts
describe('findFlashbacks', () => {
  it('returns notes older than minDaysGap from a different category', () => {
    const oldTime = Date.now() - 100 * 86_400_000;
    // SQL로 직접 created_at 조작
    const old = insertNote(client, { title: 'old', content: 'x', filePath: join(dbDir, 'o.md'), source: 'manual', layer: 'past', category: 'memory' });
    client.sqlite.prepare('UPDATE notes SET created_at = ? WHERE id = ?').run(oldTime, old.id);

    const fresh = insertNote(client, { title: 'fresh', content: 'x', filePath: join(dbDir, 'f.md'), source: 'manual', layer: 'past', category: 'projects' });
    const fakeEmbedding = new Array(768).fill(0.1);
    saveEmbedding(client, old.id, fakeEmbedding);
    saveEmbedding(client, fresh.id, fakeEmbedding);

    const flashbacks = findFlashbacks(client, fresh.id, fakeEmbedding, Date.now());
    expect(flashbacks.map((f) => f.id)).toContain(old.id);
    expect(flashbacks[0].daysAgo).toBeGreaterThanOrEqual(90);
  });

  it('excludes notes in the same category as the source', () => {
    const old = insertNote(client, { title: 'same-cat-old', content: 'x', filePath: join(dbDir, 'so.md'), source: 'manual', layer: 'past', category: 'projects' });
    client.sqlite.prepare('UPDATE notes SET created_at = ? WHERE id = ?').run(Date.now() - 200 * 86_400_000, old.id);

    const fresh = insertNote(client, { title: 'fresh', content: 'x', filePath: join(dbDir, 'f.md'), source: 'manual', layer: 'past', category: 'projects' });
    const fakeEmbedding = new Array(768).fill(0.1);
    saveEmbedding(client, old.id, fakeEmbedding);
    saveEmbedding(client, fresh.id, fakeEmbedding);

    const flashbacks = findFlashbacks(client, fresh.id, fakeEmbedding, Date.now());
    expect(flashbacks.map((f) => f.id)).not.toContain(old.id);
  });
});
```

**Step 3: 실행 + export**

`packages/db/src/index.ts` 에 `findFlashbacks`, `Flashback`, `FlashbackOptions` 추가.

```bash
yarn test packages/db
yarn workspace @memex/db build
git add packages/db
git commit -m "feat(db): add findFlashbacks query (vector + time gap + cross-category)"
```

---

## Task 3: save_note service에 flashback 통합

**Files:**
- Modify: `apps/mcp/src/services/note.ts`
- Modify: `apps/cli/src/services/note.ts`

**Step 1: saveNote 반환 타입 확장**

```ts
import { findFlashbacks, type Flashback } from '@memex/db';

export const saveNote = async (
  ...
): Promise<{ note: Note; similar: SimilarNote[]; flashbacks: Flashback[] }> => {
  ...
  // 기존 logic 끝부분
  const flashbacks = findFlashbacks(client, note.id, embedding, Date.now(), readFlashbackOptions());

  // note_links에 flashback source로 insert
  const insertLink = client.sqlite.prepare(
    "INSERT OR IGNORE INTO note_links(source_id, target_id, source) VALUES (?, ?, 'flashback')",
  );
  for (const f of flashbacks) insertLink.run(note.id, f.id);

  return { note, similar, flashbacks };
};
```

**Step 2: env helper**

```ts
const readFlashbackOptions = () => ({
  minDaysGap: process.env.MEMEX_FLASHBACK_DAYS ? Number(process.env.MEMEX_FLASHBACK_DAYS) : undefined,
  maxDistance: process.env.MEMEX_FLASHBACK_DIST ? Number(process.env.MEMEX_FLASHBACK_DIST) : undefined,
});
```

**Step 3: CLI service 동일 패치**

`apps/cli/src/services/note.ts` 도 같은 변경 (단 service가 search 안 함 — save 시 flashback만).

**Step 4: 테스트**

`apps/mcp/src/services/note.test.ts` 에 케이스 추가 — 90일+ 전 노트가 있을 때 saveNote 결과에 flashback 포함.

**Step 5: Commit**

```bash
git add apps/{mcp,cli}/src/services/note.ts apps/mcp/src/services/note.test.ts
git commit -m "feat(service): emit flashbacks from saveNote + persist as flashback-source links"
```

---

## Task 4: MCP save_note tool 응답에 flashback surface

**Files:**
- Modify: `apps/mcp/src/tools/save-note.ts`

**Step 1: 응답 텍스트에 flashback 섹션 추가**

```ts
const { note, similar, flashbacks } = await saveNote(client, embedder, vaultPath, { ... });

const flashbackSection = flashbacks.length > 0
  ? `\n\n🔗 Flashback — notes from a different context:\n${flashbacks
      .map((f) => `- [Flashback] ${f.daysAgo} days ago: #${f.id} "${f.title}" (${((1 - f.distance) * 100).toFixed(0)}% match)`)
      .join('\n')}`
  : '';

const text = `Saved note #${note.id}: "${note.title}"${warning}${flashbackSection}`;
```

**Step 2: tool description 업데이트**

`save_note` description에 한 줄 추가:
```
The response may include "Flashback" lines pointing to older notes from different contexts that are semantically similar — surface these to the user when relevant.
```

**Step 3: 빌드 + 수동 검증**

Claude Desktop에서 새 노트 저장 후 응답에 "🔗 Flashback" 섹션이 뜨는지 확인.

**Step 4: Commit**

```bash
git add apps/mcp/src/tools/save-note.ts
git commit -m "feat(mcp): surface flashbacks in save_note response"
```

---

## Task 5: MCP search_notes 응답 하단에 flashback hint

**Files:**
- Modify: `apps/mcp/src/tools/search-notes.ts`
- Modify: `apps/mcp/src/services/note.ts` (`semanticSearch` flashback 추가 옵션)

**Step 1: search 결과 top-1을 anchor로 flashback 계산**

```ts
// search-notes.ts
const results = await semanticSearch(...);
if (results.length === 0) return { content: [{ type: 'text', text: 'No notes found.' }] };

const topId = results[0].id;
const topEmbedding = await embedder(`${results[0].title}\n\n${results[0].content}`, 'passage');
const flashbacks = findFlashbacks(client, topId, topEmbedding, Date.now(), readFlashbackOptions());

const flashbackHint = flashbacks.length > 0
  ? `\n\n---\n🔗 Flashback for top result:\n${flashbacks
      .map((f) => `- ${f.daysAgo} days ago: #${f.id} "${f.title}"`)
      .join('\n')}`
  : '';

const text = results.map(...).join('\n\n---\n\n') + flashbackHint;
```

**Step 2: 비용 주의 — top result 본문이 길면 embedder 호출 시간**

이미 search 결과에 embedding이 있는 경우 재사용. `findFlashbacks` 시그니처를 noteId만 받고 embedding은 DB에서 SELECT 하도록 변경하는 것도 옵션 — 결정: 깔끔하게 noteId만 받기.

**Step 3: findFlashbacks 시그니처 단순화 (refactor)**

```ts
export const findFlashbacks = (
  client: MemexClient,
  noteId: number,
  now: number,
  options: FlashbackOptions = {},
): Flashback[] => {
  const embRow = client.sqlite
    .prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?')
    .get(BigInt(noteId)) as { embedding: Buffer } | undefined;
  if (!embRow) return [];
  // 기존 로직: embRow.embedding 을 그대로 사용
  ...
};
```

Task 2/3 호출부도 같이 업데이트 (embedding 인자 제거).

**Step 4: Commit**

```bash
git add apps/mcp/src/{tools,services}/ packages/db/src/repository.ts
git commit -m "feat(mcp): add flashback hint to search_notes response"
```

---

## Task 6: CLI에서 flashback 표시

**Files:**
- Modify: `apps/cli/src/commands/search.ts`
- Modify: `apps/cli/src/commands/show.ts`

**Step 1: `memex search` 하단에 flashback 출력**

```ts
import { findFlashbacks } from '@memex/db';
import { layerBadge } from '../layer.ts';

// 기존 search 결과 출력 끝나고
if (results.length > 0) {
  const flashbacks = findFlashbacks(client, results[0].id, Date.now());
  if (flashbacks.length > 0) {
    console.log();
    console.log(pc.dim('--- Flashback ---'));
    for (const f of flashbacks) {
      console.log(`${pc.dim(`[#${f.id}]`)} ${layerBadge(f.layer)} ${f.title} ${pc.dim(`${f.daysAgo}d ago`)}`);
    }
  }
}
```

**Step 2: `memex show <id>` 에 시스템 백링크 별도 섹션**

```ts
// 기존 backlinks 출력 후, source='flashback' 인 incoming link 표시
const flashbackLinks = client.sqlite
  .prepare("SELECT n.id, n.title FROM note_links l JOIN notes n ON n.id = l.source_id WHERE l.target_id = ? AND l.source = 'flashback'")
  .all(Number(id)) as { id: number; title: string }[];

if (flashbackLinks.length > 0) {
  console.log();
  console.log(pc.dim('--- Surfaced as flashback in ---'));
  for (const f of flashbackLinks) console.log(`${pc.dim(`[#${f.id}]`)} ${f.title}`);
}
```

**Step 3: Commit**

```bash
git add apps/cli/src/commands/
git commit -m "feat(cli): show flashbacks in search + show commands"
```

---

## Task 7: env 문서화 + 운영 가이드

**Files:**
- Modify: `README.md`

**Step 1: README 섹션 추가**

```md
## Flashback

When you save a note or search, memex automatically surfaces older notes from a *different folder* that are semantically similar — "you wrote about this 124 days ago in a different context."

Stored as system-generated backlinks (`note_links.source = 'flashback'`), separate from your `[[wikilinks]]` (`source = 'wiki'`).

Tunable via env:

| Env | Default | Meaning |
|---|---|---|
| `MEMEX_FLASHBACK_DAYS` | 90 | minimum age gap (days) |
| `MEMEX_FLASHBACK_DIST` | 0.4 | maximum vector distance |
| `MEMEX_FLASHBACK_LIMIT` | 3 | max suggestions per surface |
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document Flashback feature and env vars"
```

---

## 평가 지표 (1개월 관찰)

- **Reuse Rate**: search 결과 중 Flashback 추천 노트 열람률 ≥ 20%
- **Contextual Jump**: Claude가 답변에서 과거 맥락("3개월 전 X 작업과 연결...")을 인용하는 빈도 — 정성 관찰
- **False positive 비율**: Flashback이 떴는데 사용자가 "관련 없다"고 dismiss하는 비율. 30% 초과 시 distance threshold 0.4 → 0.35로 조정

---

## 위험 요소 + 완화

| 위험 | 완화 |
|---|---|
| False positive 노이즈로 신뢰 박살 | threshold 보수적으로 (0.4), 결과 3개로 제한, env로 튜닝 가능 |
| save_note latency 증가 | findFlashbacks는 단일 SQL — 측정상 ~10ms |
| 모든 search마다 flashback 계산 | top-1 만 anchor로 — 추가 SQL 1회만 |
| Wikilink source 충돌 | PK가 (source_id, target_id, source) 복합 키 → 같은 link도 source 다르면 별도 row |
| 마이그레이션 시 기존 row의 source NULL | DEFAULT 'wiki' + 새 컬럼 추가 시 모든 기존 row 'wiki' 값으로 채워짐 |

---

## 관련 노트

- [[Memex Second Brain 방향성 논의 (Gemini 2R, 2026-05-24)]] — Flashback 알고리즘 원본
- [[memex 개발 노트]] — 현행 검색 + note_links 스키마
- [[Note Layer v1 spec 확정 (2026-05-24)]] — layer 모델 (past 노트가 flashback의 1순위 후보)
