# Rule 노트 자동 inject Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `rule` layer 노트(현재 `Evan 코드 스타일 가이드 (FP 중심)` + `TypeScript 코딩 원칙: 타입 추론과 Type Assertion` 2개)를 MCP server instructions에 **부팅 시점 자동 inject**한다. search hit 여부와 무관하게 항상 Claude가 인지하도록.

**Why:** rule layer를 만든 본질적 이유는 "Claude가 매번 search해야만 닿을 수 있는 가변 fact"가 아니라 "**대화 시작부터 알고 있어야 하는 행동 안내**"이기 때문. Eugene Yan의 `~/.claude` 패턴과 일치 — vault(검색 대상) vs context(항상 주입).

**Architecture:** MCP server boot 시 `openDb()` 직후 `SELECT * FROM notes WHERE layer = 'rule'` 으로 rule 노트들을 읽어, 정적 instructions 끝에 `## House Rules` 섹션으로 append. 토큰 가드(기본 8KB)로 폭증 방지. Claude Desktop 재시작 = MCP 재부팅이므로 변경 반영도 자연스러움.

**Out of scope:**
- 동적 reload (rule 노트 수정 후 즉시 반영) — 사용자가 Claude Desktop 재시작하면 됨
- rule 노트의 우선순위(weight) — v1은 전부 동등 inject
- CLAUDE.md 합치기 — separation of concerns

**Tech Stack:** TypeScript, `@memex/db`, `@modelcontextprotocol/sdk`.

**Build command:**
```bash
cd /Users/evan/dev/playground/memex && yarn workspace @evan-moon/memex build
```

---

## 디자인 결정 요약

| 결정 | 선택 | 이유 |
|---|---|---|
| 시점 | MCP server 부팅 (`new McpServer({ instructions })` 이전) | Claude Desktop restart로 자연스럽게 갱신 |
| 위치 | `apps/mcp/src/index.ts` | MCP 한정 — CLI는 무관 |
| 가드 | 총 ≤ 8000 chars (~2K tokens) | 초과 시 truncate + console.warn |
| 정렬 | `ORDER BY id ASC` | 결정론적, 사용자가 id 순서로 control 가능 |
| 토글 | env `MEMEX_INJECT_RULES=0` 으로 비활성 | 디버깅·A/B 용 |

---

## Task 1: rule 노트 로더 helper + 테스트

**Files:**
- Create: `apps/mcp/src/services/rules.ts`
- Create: `apps/mcp/src/services/rules.test.ts`

**Step 1: 실패 테스트 작성**

```ts
// apps/mcp/src/services/rules.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNote, openDb, type MemexClient } from '@memex/db';
import { buildRuleInstructions } from './rules.ts';

describe('buildRuleInstructions', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-rules-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('returns empty string when no rule notes exist', () => {
    insertNote(client, { title: 'a', content: 'x', filePath: join(dbDir, 'a.md'), source: 'manual', layer: 'past' });
    expect(buildRuleInstructions(client)).toBe('');
  });

  it('inlines rule note content under a House Rules header', () => {
    insertNote(client, { title: 'Style', content: 'Use FP.', filePath: join(dbDir, 's.md'), source: 'manual', layer: 'rule' });
    insertNote(client, { title: 'TS', content: 'No `as`.', filePath: join(dbDir, 't.md'), source: 'manual', layer: 'rule' });
    const out = buildRuleInstructions(client);
    expect(out).toContain('## House Rules');
    expect(out).toContain('### Style');
    expect(out).toContain('Use FP.');
    expect(out).toContain('### TS');
    expect(out).toContain('No `as`.');
  });

  it('truncates content over the byte budget and warns', () => {
    const big = 'x'.repeat(10_000);
    insertNote(client, { title: 'Big', content: big, filePath: join(dbDir, 'b.md'), source: 'manual', layer: 'rule' });
    const out = buildRuleInstructions(client, { maxChars: 2000 });
    expect(out.length).toBeLessThanOrEqual(2200);
    expect(out).toContain('[truncated]');
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
yarn test apps/mcp/src/services/rules
```
Expected: FAIL — module not found.

**Step 3: 최소 구현**

```ts
// apps/mcp/src/services/rules.ts
import type { MemexClient } from '@memex/db';

type Options = { maxChars?: number };

export const buildRuleInstructions = (
  client: MemexClient,
  options: Options = {},
): string => {
  const maxChars = options.maxChars ?? 8000;
  const rows = client.sqlite
    .prepare("SELECT title, content FROM notes WHERE layer = 'rule' ORDER BY id ASC")
    .all() as { title: string; content: string }[];

  if (rows.length === 0) return '';

  const sections = rows.map((r) => `### ${r.title}\n\n${r.content.trim()}`);
  const joined = `## House Rules\n\n${sections.join('\n\n---\n\n')}`;

  if (joined.length <= maxChars) return joined;

  const truncated = joined.slice(0, maxChars) + '\n\n... [truncated]';
  console.warn(`[memex] rule instructions truncated: ${joined.length} → ${truncated.length} chars`);
  return truncated;
};
```

**Step 4: 테스트 통과 확인**

```bash
yarn test apps/mcp/src/services/rules
```
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/mcp/src/services/rules.ts apps/mcp/src/services/rules.test.ts
git commit -m "feat(mcp): add buildRuleInstructions helper for rule layer auto-inject"
```

---

## Task 2: MCP server instructions에 wire

**Files:**
- Modify: `apps/mcp/src/index.ts`

**Step 1: import 추가**

```ts
import { buildRuleInstructions } from './services/rules.ts';
```

**Step 2: instructions 빌드 부분 변경**

기존:
```ts
const server = new McpServer({ name: 'memex', version: '0.1.0' }, {
  instructions: `
You are connected to the user's second brain (memex). ...
`.trim(),
});
```

변경:
```ts
const baseInstructions = `
You are connected to the user's second brain (memex). ...
`.trim();

const injectRules = process.env.MEMEX_INJECT_RULES !== '0';
const ruleSection = injectRules ? buildRuleInstructions(client) : '';

const instructions = ruleSection ? `${baseInstructions}\n\n${ruleSection}` : baseInstructions;

const server = new McpServer({ name: 'memex', version: '0.1.0' }, { instructions });
```

**Step 3: 빌드 + smoke test**

```bash
yarn workspace @evan-moon/memex build
node apps/cli/dist/mcp.js < /dev/null &
sleep 1
kill %1
```
에러 없이 부팅하면 OK. 더 정확하게는 MCP initialize handshake로 instructions 응답을 확인 — 기존 `apps/cli/test/mcp-smoke.mjs` 가 있으면 활용.

**Step 4: 수동 검증 — Claude Desktop에서 확인**

Claude Desktop 재시작 후 memex MCP의 server info 응답에 "House Rules" 섹션이 포함되는지 확인. 또는 Claude에게 "지금 어떤 코드 스타일 규칙을 알고 있어?" 물어보면 rule 노트 내용을 직접 인용해야 함.

**Step 5: Commit**

```bash
git add apps/mcp/src/index.ts
git commit -m "feat(mcp): auto-inject rule layer notes into server instructions"
```

---

## Task 3: 토큰 가드 + 운영 가이드 문서화

**Files:**
- Modify: `README.md` (또는 `apps/mcp/README.md`)

**Step 1: README에 섹션 추가**

```md
## Rule layer auto-inject

Notes with `layer = 'rule'` are automatically injected into the MCP server's instructions on boot. These appear under a "House Rules" section so Claude knows them at the start of every conversation, with no need to call `search_notes`.

- Default budget: 8000 characters. Override with `MEMEX_RULES_MAX_CHARS=12000`.
- Disable entirely with `MEMEX_INJECT_RULES=0`.
- Updates to rule notes are picked up on the next Claude Desktop restart.
```

**Step 2: env 추가 (선택) — `MEMEX_RULES_MAX_CHARS`**

`apps/mcp/src/index.ts`:
```ts
const maxChars = process.env.MEMEX_RULES_MAX_CHARS ? Number(process.env.MEMEX_RULES_MAX_CHARS) : undefined;
const ruleSection = injectRules ? buildRuleInstructions(client, { maxChars }) : '';
```

**Step 3: Commit**

```bash
git add README.md apps/mcp/src/index.ts
git commit -m "docs: document rule layer auto-inject and budget env vars"
```

---

## 위험 요소 + 완화

| 위험 | 완화 |
|---|---|
| rule 노트 본문에 잘못된 정보 → Claude가 잘못 행동 | 사용자만 rule write 가능(이미 Task 4 in note-layers spec). 신중하게 promotion. |
| 토큰 폭증 | 8KB 가드. 초과 시 console.warn + truncate. |
| Claude Desktop이 재시작 안 되면 stale | README에 명시. v2에서 hot reload 고려. |
| MCP host가 instructions 무시 | Claude Desktop과 Claude Code는 honor. 그 외는 가이드 무시 가능 — 그러나 inject로 인한 부작용은 없음. |

---

## 관련 노트

- [[Evan 코드 스타일 가이드 (FP 중심)]] — 현재 rule 노트
- [[TypeScript 코딩 원칙: 타입 추론과 Type Assertion]] — 현재 rule 노트
- [[Note Layer v1 spec 확정 (2026-05-24)]] — layer 모델 도입 배경
