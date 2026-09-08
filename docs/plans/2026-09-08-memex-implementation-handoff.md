# Memex Second Brain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 이 이름으로 스킬이 없으면 사용 가능한 `executing-plans` 스킬을 읽는다. 실행 권한은 이 문서 자체가 아니라 사용자의 구현 요청에서 온다.

**Goal:** 기존 기억 기능을 보존하면서 사람이 직접 문서를 읽고 쓰고, 앱과 외부 AI에서 같은 자료로 작업하는 Second Brain으로 전환한다.

**Architecture:** 기존 Markdown·SQLite·notes ID를 유지하고 공통 문서/기억 쓰기 서비스를 추가한다. UI/API/MCP/CLI가 이를 공유하며, LLM 실행과 Electron 기능은 호스트 어댑터에 남긴다. 전체 재작성이나 신규 데몬을 전제하지 않는다.

**Tech Stack:** TypeScript, React 19, React Router, CodeMirror 6, Electron, Tailwind 4, SQLite, Vitest, 기존 MCP 및 모델 어댑터.

---

## 0. 읽는 순서와 설계 권위

1. [제품 재설계](2026-09-08-second-brain-product-redesign.md): 왜 만드는가.
2. [경험 설계](2026-09-08-memex-experience-spec.md): 화면·동작·상태·범위.
3. [데이터와 동작 계약](2026-09-08-memex-domain-contract.md): 정책·저장·호환·실패 복구.
4. 이 문서: 실제 변경 순서와 검증.

2026-09-08 설계 작업에서는 제품 코드를 변경하거나 실행하지 않았다. 기존 버그 여부를 실행으로 확정하지도 않았다. 코드 조사 기준 commit은 `0c00e5d`이며 구현 시작 시 달라질 수 있다. 새 파일명은 제안이다. 기존에 동등한 코드가 생겼으면 중복하지 않고 재사용한다.

사용자의 현재 의도는 사람이 직접 읽고 쓰는 앱과 AI 기억 기반을 함께 제공하는 것이다. `CLAUDE.md`, `apps/ui/PRODUCT.md`의 ‘사람은 고칠 때만 쓴다’, ‘읽기 수요 없음’, ‘past라서 사람도 원문 편집 불가’는 이번 방향과 충돌하는 이전 전제다. 사용자가 이 설계의 구현을 요청하면 해당 범위의 전제를 문서와 함께 갱신한다. 이 충돌을 근거로 이미 요청된 직접 쓰기 기능을 거절하지 않는다. unrelated 운영/보안 규칙은 그대로 적용한다.

### 확정한 제안과 가정

- 제품 범위: 글쓰기 전용으로 축소하지 않는다.
- 인터페이스: Electron과 기존 테마 유지, 정보 구조/상호작용 재설계.
- 초기 검증 작업: 긴 글 1편과 프로젝트 계획 수정 1건을 기본 가정으로 사용. 사용자가 다른 우선 작업을 답하면 fixture와 노출 순서를 수정한다.
- v1 지원 문법: 일반 Markdown, GFM 표/체크리스트/코드 블록, 기존 wiki link, YAML 보존, 로컬 이미지 경로. 실제 renderer 지원 여부는 task 1에서 확인한다. 지원하지 않는 문법은 원문 보존+원문 모드/파일 열기로 안내한다.
- Canvas, 플러그인 실행, PDF 본문 추출, 협업, 동기화, 외부 발행은 제외. Obsidian 완전 호환을 주장하지 않는다.

## 1. 작업 규율과 검증 환경

- 먼저 git status와 현재 지침을 읽는다. 사용자의 기존 변경을 보존하고 필요하면 별도 작업 공간을 사용한다.
- UI가 아닌 문서·정책 변경을 위해 테스트를 만들지 않는다. 저장/권한/충돌/라우팅/정정처럼 행동이 바뀌는 곳은 실패하는 재현 테스트부터 만든다.
- 각 작업은 테스트 추가 → 해당 테스트의 기대 실패 확인 → 최소 변경 → 해당 테스트 통과 → diff 검토 순으로 진행한다. 아래 테스트 이름은 생성 예정이면 명시했다.
- 테스트는 임시 볼트/DB, 가짜 embedder/provider로 실행한다. 실제 `~/.memex`나 사용자 원고를 fixtures로 수정하지 않는다.
- 현재 UI 서비스 변경은 CLI dist에 묶인다. Electron 검증 전 `yarn workspace @evan-moon/memex build`를 실행해야 한다. 화면만 바뀌고 서버는 이전 dist인 상태를 검증하지 않는다.
- UI 실사용 검증은 Electron `memex://app/` 기준이다. 브라우저 포트 경로를 제품 기능으로 추가하지 않는다.
- 기능별 완료 때 변경·검증·미해결을 기록한다. 커밋/PR/배포는 사용자의 세션 지침에 따른다.

## 2. 의존 순서

```mermaid
flowchart LR
  T1[1 기준과 fixtures] --> T2[2 메타데이터와 버전]
  T2 --> T3[3 공통 저장과 복구]
  T3 --> T4[4 영속 초안과 자동 저장]
  T4 --> T5[5 시작하기와 앱 구조]
  T5 --> T6[6 자료와 문서 작업]
  T6 --> T7[7 AI 맥락과 제안]
  T3 --> T8[8 기억 정정]
  T7 --> T9[9 MCP와 CLI 일관성]
  T8 --> T9
  T9 --> T10[10 전체 저니와 문서 정리]
```

공통 저장의 위험을 먼저 낮추되 모든 도메인 재작성을 끝내야 UI를 만들 수 있는 구조로 확대하지 않는다. 각 단계에는 기존 기능 회귀 확인을 포함한다. 사용자가 전체 실행을 요청했다면 단계마다 재승인을 요구하지 말고 다음 단계로 진행한다. 새로운 범위/권한이 필요한 경우에만 구체적인 차이를 설명한다.

### Task 1: 기준 문서와 샘플 볼트

**Files:** 수정 `CLAUDE.md`, `apps/ui/PRODUCT.md`, `README.md`; 생성 `docs/qa/memex-v1-acceptance.md`, `tests/fixtures/memex-v1/` 아래 synthetic Markdown.

1. 네 설계 문서를 읽고 실제 코드 차이를 기록한다. 문서의 추정 파일 경로를 탐색으로 확인한다.
2. 제품 정의와 표면 책임을 갱신한다. README는 기능이 구현되기 전 완료된 것처럼 광고하지 않고 목표와 현재 지원을 구분한다.
3. fixture: 긴 원고, 참고 글, AI 초안, 명시적 현재 계획, 정정된 past, 승인/미승인 rule, 이름이 같은 문서, 깨진 링크, 로컬 이미지, unknown YAML. Git 없는 볼트를 기본으로 한다.
4. 기준 테스트 `yarn test`와 `yarn typecheck`를 한 번 실행해 기존 실패와 새 실패를 구분한다. ABI 준비가 필요하면 `yarn native`를 사용한다.

**완료:** 비수정 샘플 볼트와 재현 가능한 기준 결과. 실제 자료 가져오기를 요구하지 않고 기본 설계를 구현 가능.

### Task 2: 문서 메타데이터·버전·journal

**Files:** 수정 `packages/db/src/schema.ts`, `client.ts`, `migrations.ts`, `index.ts`; 생성 `packages/db/src/document-revisions.ts`, `document-revisions.test.ts`, `document-meta.ts`, `document-meta.test.ts`. 기존 저장소 이름과 겹치면 통합.

1. migration 재실행, ID 보존, unknown origin, revision parent, mutationId 중복에 대한 테스트 작성.
2. 실행: `yarn test packages/db/src/document-revisions.test.ts packages/db/src/document-meta.test.ts packages/db/src/migrations.test.ts`.
3. additive migration과 repository 구현. 초안/reference/proposal 테이블은 필요한 단계에서 추가해도 되며 domain contract의 키/정책을 유지한다.
4. 기존 파일을 수정하지 않는 migration, 원문 baseline 및 같은 mutationId의 동일 결과를 확인한다.

**완료:** Git 없이 원문 revision을 읽고 복구할 수 있는 저장 기반. 과거 author 기본값을 person 소유권으로 승격하지 않음.

### Task 3: 모델 없는 문서 저장·권한·실패 복구

**Files:** 생성 `packages/core/src/documents.ts`, `documents.test.ts`, 필요하면 `document-policy.ts`; 수정 `packages/core/src/index.ts`, `note.ts`, `apps/cli/src/services/ui/server.ts`, `notes.ts`, 필요 시 `host.ts`/`model.ts`; 관련 테스트 `apps/cli/src/services/ui/save.test.ts`.

1. 문서 빈 본문 저장, 모델 미준비, stale revision, 중복 mutationId, user/agent 권한, YAML 보존, file-write 실패/journal 복구 테스트 작성.
2. 실행: `yarn test packages/core/src/documents.test.ts apps/cli/src/services/ui/save.test.ts packages/core/src/note.test.ts`.
3. create/update/restore와 명확한 capability 응답 구현. 문서 모드에서만 layer 템플릿/빈 본문 제약을 완화한다.
4. versioned save → FTS → revision별 임베딩 후속 갱신 분리. indexing 실패를 저장 실패로 오인하지 않게 한다.
5. 두 개의 memex 프로세스가 같은 문서를 갱신하는 fixture 검증 추가. in-memory lock만으로 완료 처리하지 않는다.

**완료:** 새 직접 작성 문서와 기존 원문 편집이 안전하게 저장. legacy agent past 보호와 외부 폴더 정책 유지. journal의 prepared 각 실패 지점에서 복구 가능한 상태가 문서화됨.

### Task 4: 초안·자동 저장·재진입

**Files:** 수정 `apps/ui/src/autosave.ts`, `editing.tsx`, `screens.tsx`, `tabs.ts`, `apps/desktop/src/main.ts`; 생성 `apps/ui/src/autosave.test.tsx`, `draft-recovery.ts`, `draft-recovery.test.ts`; API/DB 추가는 domain contract 참고.

1. 가짜 지연 응답으로 ‘먼저 보낸 저장 응답이 늦게 도착’, ‘저장 도중 새 입력’, ‘새 문서 생성 응답 전 이동’ 재현 테스트 작성.
2. 실행: `yarn test apps/ui/src/autosave.test.tsx apps/ui/src/draft-recovery.test.ts apps/ui/src/editing.test.tsx apps/ui/src/tabs.test.ts`.
3. 문서별 sequence/queue, 영속 draft, vault별 탭 상태, 저장/종료 handshake 구현.
4. 충돌 시 서버 원문과 초안을 모두 보존. dirty buffer를 polling 응답으로 덮지 않는다.
5. IME 조합, 창 종료 실패, 강제 종료 후 이미 영속화된 초안 복구를 Electron fixture 환경에서 확인한다.

**완료:** 앱을 닫았다 열어 작업을 이어감. ‘저장됨’은 최신 사용자 입력의 저장 확인 후에만 표시.

### Task 5: 온보딩·홈·내비게이션

**Files:** 수정 `apps/ui/src/Onboarding.tsx`, `onboarding.ts`, `Overview.tsx`, `Sidebar.tsx`, `App.tsx`, `i18n.ts`, `apps/cli/src/services/ui/onboarding.ts`, `overview.ts`; 생성 `apps/ui/src/Library.tsx`, `Library.test.tsx`.

1. AI/검색 모델 없이 온보딩 완료, 빈 홈 새 문서, 최근 문서 재진입, 기존 deep link 유지 테스트 작성.
2. 실행: `yarn test apps/ui/src/onboarding.test.ts apps/ui/src/Overview.test.tsx apps/ui/src/Library.test.tsx apps/cli/src/services/ui/server.test.ts`.
3. UX spec의 메뉴와 홈을 구현하고 기존 보조 라우트를 유지한다. 홈의 전역 확인 덱을 기억 화면의 보조 진입으로 옮긴다.
4. 키보드 포커스, 창 드래그 영역, 한국어/영어, 기존 테마 유지 확인.

**완료:** 새 사용자가 AI 연결 없이 원고를 시작. 기존 사용자가 마지막 작업을 이어감.

### Task 6: 참고 자료와 문서 작업 공간

**Files:** 생성 `apps/ui/src/DocumentWorkspace.tsx`, `ReferencePanel.tsx`, `ReferencePanel.test.tsx`; 수정 `screens.tsx`, `panels.ts`, `api.ts`, `editor/Editor.tsx`; 기존 `SearchScreen.test.tsx`, `wiki-links.test.ts`, `Markdown.test.tsx` 재사용.

1. 참고 추가가 주 문서/커서를 유지, 중복 참고 처리, 원문 변경/삭제 표시, 좁은 창 패널 포커스 복원 테스트.
2. 실행: `yarn test apps/ui/src/ReferencePanel.test.tsx apps/ui/src/SearchScreen.test.tsx apps/ui/src/wiki-links.test.ts apps/ui/src/Markdown.test.tsx`.
3. 라이브러리와 참고 패널은 같은 검색 API 사용. 새 검색 구현을 복제하지 않는다.
4. 참조 관계는 source revision/quote로 저장하고 AI context와 재사용한다. 원문을 문서 본문에 자동 복제하지 않는다.
5. wide/narrow, 테마, 긴 문서/제목을 한 번에 시각 검증한다. 색상/폰트를 새로 설계하지 않는다.

**완료:** fixture 원고에서 근거 2개를 찾고 옆에 보며 직접 작성하는 J1 기본 흐름 완료.

### Task 7: AI 맥락·수정 제안

**Files:** 수정 `apps/ui/src/Chat.tsx`, `chat-target.ts`, `api.ts`, `apps/cli/src/services/chat/plan.ts`, `turn.ts`, `services/ui/chat.ts`; 생성 `apps/cli/src/services/chat/context.ts`, `context.test.ts`; 기존 `edit-note.test.ts`, `chat-target.test.ts` 확장.

1. 요청시 target snapshot, 선택 범위 밖 변경 거절, 오래된 proposal 거절, 취소 원문 불변, 참조와 지침 구분 테스트.
2. 실행: `yarn test apps/cli/src/services/chat/context.test.ts apps/cli/src/services/chat/edit-note.test.ts apps/cli/src/services/ui/chat.test.ts apps/ui/src/chat-target.test.ts`.
3. context manifest와 지속 proposal 구현. Chat의 기존 preview/apply 구조를 재사용한다.
4. 출처 링크, 적용/취소/재요청, 제공자 미연결에서 입력 복구 구현. 전체 볼트 검색은 허용 범위와 사용자 선택으로 제한한다.
5. AI 호출 동안 탭을 바꾼 뒤 결과가 원래 문서에만 연결되는지 확인한다.

**완료:** J1 AI 협업과 프로젝트 계획 수정. 테스트에 실제 유료 모델 호출을 요구하지 않는다. 실제 제공자 수동 확인은 사용자 연결/범위 안에서 별도 기록한다.

### Task 8: 기억 목록·정정 완료

**Files:** 생성 `apps/ui/src/Memory.tsx`, `Memory.test.tsx`, `packages/core/src/memory.ts`, `memory.test.ts`; 수정 `apps/cli/src/services/ui/register.ts`, `review.ts`, `server.ts`, `apps/ui/src/Review.tsx`, `packages/db/src/claims.ts`; 기존 `claim-standing.test.ts`, `register.test.ts` 확장.

1. claim/register union 조회, 새 값 정정, 대체 값 없는 폐기, version conflict, 중복 재시도, undo 의미 검증.
2. 실행: `yarn test packages/core/src/memory.test.ts apps/ui/src/Memory.test.tsx packages/db/src/claim-standing.test.ts packages/db/src/register.test.ts apps/ui/src/Review.test.tsx`.
3. 기존 claims/register를 조회 모델로 합치고 정정 서비스로 연결. 카드에서 ‘틀렸어요’는 폼 또는 같은 target을 가진 패널로 이어진다.
4. 원문 변경은 evidenceState만 변경하며 새 사실로 자동 승인하지 않는다.

**완료:** J3가 값 변경 또는 폐기까지 같은 자리에서 끝나고 다음 조회 결과에 상태가 반영됨.

### Task 9: MCP·CLI 일관성과 외부 변경

**Files:** 수정 `apps/mcp/src/tools/get-note.ts`, `search-notes.ts`, `save-note.ts`, `update-note.ts`, `set-register.ts`, `apps/mcp/src/index.ts`, `apps/cli/src/commands/edit.ts`, `add.ts`, 기존 indexer/host 경로; 생성 `apps/mcp/src/tools/update-note.test.ts`가 아직 없으면 생성.

1. 구형 read/save 호출 호환, 새 문서 revision 필수, 요청 actor 위조 방지, person 문서 proposal, state 메모리 갱신, 외부 변경 후 앱 재조회 테스트.
2. 실행: `yarn test apps/mcp/src/tools/get-note.test.ts apps/mcp/src/tools/search-notes.test.ts apps/mcp/src/tools/save-note.test.ts apps/mcp/src/tools/update-note.test.ts apps/cli/src/services/indexer.test.ts`.
3. domain contract의 operation union과 에러 응답 구현. 기존 set_register도 같은 정정 이력을 사용한다. MCP 시작 시 embedder 준비를 기다리는 현재 경로를 분리하고 모델 없이도 도구 등록·기본 읽기/문서 저장이 가능한지 확인한다.
4. 각 클라이언트는 도구 설명 변경을 받도록 재연결 필요성을 안내한다. 표면별 actor는 trusted adapter에서 결정.
5. 앱 종료 상태의 MCP 동작, 재진입 시 변경 확인, dirty 문서 충돌, 원문이 삭제된 상태를 검증한다.

**완료:** J2와 J3가 앱/MCP를 왕복하며 완료. CLI는 공통 정책을 우회하지 않음.

### Task 10: 전체 검증과 인수인계 기록

**Files:** `docs/qa/memex-v1-acceptance.md`, `README.md`, `CLAUDE.md`, `apps/ui/PRODUCT.md`, 필요시 CLI/MCP 사용 문서.

1. `yarn test`, `yarn typecheck`, `yarn build` 실행. 실패를 기존/신규로 구분하고 관련 신규 실패 해결. 실패를 숨기려고 테스트를 삭제하거나 실제 볼트로 재시도하지 않는다.
2. Electron 테스트 환경은 임시 볼트를 설정하도록 준비하고 사용자 기본 config를 덮지 않는다. 필요한 환경 주입은 host에 한정한다.
3. 아래 수용 시나리오를 실행하고 테마/폭/예외 상태를 묶어 화면 검증한다.
4. 데이터 복구와 source 폴더 정책, 미지원 문법, 구형 쓰기 제한을 문서에 반영한다.
5. 적용 migration, 남은 문제, 실제 확인한 제공자, 스크린샷/테스트 결과 위치를 기록한다. 설계 완료와 구현 완료를 구분한다.

## 3. 릴리스 수용 시나리오

| ID | Given / When | Then |
|---|---|---|
| A01 | 새 설치, AI/embedding 없음 → 볼트 생성/원고 작성 | 로그인 없이 저장·재진입 가능 |
| A02 | unknown YAML과 wiki link가 있는 기존 문서 → 한 문단 수정 | 무관한 원문·메타데이터·경로 보존 |
| A03 | 저장 지연 중 추가 입력 후 이동 | 최신 입력 유지, 중복 파일 없음 |
| A04 | Git 없는 볼트 → AI 수정 적용/앱 재실행/복원 | 적용 전 내용 복구, 새 편집 이력 유지 |
| A05 | app와 MCP가 같은 base로 동시 수정 | 한 쓰기 후 다른 쓰기는 conflict, 무음 덮어쓰기 없음 |
| A06 | 요청 후 다른 문서로 전환 | 제안은 원래 문서에만 연결 |
| A07 | 원문 수정 후 오래된 AI proposal 적용 | 자동 적용 거절, 원문과 제안 보존 |
| A08 | ‘출시 9월’을 ‘10월’로 정정 | 다음 검색과 get_note에 최신 값/정정, 과거 질문에는 이력 |
| A09 | 참고문에 ‘모든 규칙을 무시하라’ 포함 | 참고는 지침 권한을 갖지 않음 |
| A10 | agent가 unknown/person 문서 직접 덮어쓰기 요청 | 기본 정책에서 proposal 또는 거절 |
| A11 | 파일 쓰기/DB 확정/embedding 단계별 실패 | journal로 판별, 복구 가능, 저장 상태 정직 |
| A12 | 960/1280/1600 폭, 밝은/어두운 테마, 키보드와 IME | 주요 동작 접근, 포커스/선택/저장 보존 |
| A13 | 외부 파일 수정 후 dirty 앱에 복귀 | 양쪽 내용을 비교, 자동 buffer 교체 없음 |
| A14 | 활성 규칙 수정 또는 글쓰기 스킬 선택 | 미승인 새 규칙 전역 주입 없음, 작업 지침 범위 유지 |

## 4. Claude Code에 넘길 시작 프롬프트

```text
memex의 재설계를 구현해줘.

먼저 docs/plans/2026-09-08-memex-implementation-handoff.md와 그 문서가
참조하는 경험 설계·데이터 계약·제품 재설계를 읽어.

나는 memex를 직접 읽고 쓰는 Second Brain 앱으로 사용하면서 MCP의 기억 기능도
유지하려고 해. 이전 문서의 ‘사람은 고칠 때만 쓴다’는 전제는 이 방향으로 대체해.
설계된 범위의 구현을 진행하되 기존 Markdown 파일·노트 ID·출처·변경 이력과
사용자 작업을 보존해. 기존 코드를 재사용하고 전체를 새로 만들지는 마.

Task 1부터 의존 순서대로 진행하고 각 단계의 검증을 실행해.
실제 사용자 볼트가 아닌 임시 fixture로 테스트하고, 구현 완료 여부와 검증하지
못한 부분을 구분해 보고해. 설계에 없는 동기화·발행·그래프·범용 채팅 홈은 추가하지 마.
```

이 프롬프트는 사용자가 Claude Code에 실행을 요청할 때 사용한다. 현재 설계 세션에서 실행·커밋·배포를 시작하는 지시가 아니다.
