# memex second brain v1 — 수용 기준과 진행

이 문서는 [실행 인수인계](../plans/2026-09-08-memex-implementation-handoff.md)의 Task 1이
만들도록 지시한 기준 문서다. 설계 완료와 구현 완료를 구분해서 적는다.

- 구현 브랜치: `redesign/second-brain-v1`
- 설계 조사 기준 커밋: `0c00e5d`
- 구현 시작 시점 커밋: `2d70e20`

## 1. 기준선 (Task 1, 2026-09-08)

구현을 시작하기 전에 한 번 돌린 결과다. 이후에 생기는 실패는 전부 이 작업의 것이다.

| 명령 | 결과 |
|---|---|
| `yarn test` | 1325 passed · 4 skipped · **0 failed** (133 files) |
| `yarn typecheck` | 20 tasks successful, 0 failed |

Task 2 이후: `yarn test` 1357 passed · 0 failed. `schema_version` 27 → **28**.
Task 3 이후: `yarn test` 1382 passed · 0 failed.

기존 실패는 없다. 새 실패가 보이면 기존 문제로 넘기지 않는다.

## 2. 설계 문서의 추정과 실제 코드

설계 문서는 코드를 읽고 쓰였지만 실행하지는 않았다고 밝힌다. Task 1에서 대조한 결과다.

### 경로

문서가 이름을 댄 기존 파일은 **전부 실재한다.** 없는 것은 계획이 "생성"이라고 적은 것뿐이다.

없어서 만들어야 하는 것: `packages/core/src/documents.ts`, `apps/ui/src/autosave.test.tsx`,
`apps/ui/src/Library.tsx`, `apps/ui/src/Memory.tsx`, `docs/qa/`.

### 동작

| 문서의 주장 | 확인 결과 |
|---|---|
| MCP가 embedder를 기다린 뒤 도구를 등록한다 | 사실. `apps/mcp/src/index.ts:42`가 `await createEmbedder`, 도구 등록은 `:170` |
| `useAutosave`는 유휴 후 저장하고 unmount에서 비동기 저장한다 | 사실. `IDLE_MS = 900`, unmount에서 `write(last).catch(() => {})`. sequence도 영속 초안도 없다 |
| `services/ui/history.ts`가 git log/show를 쓴다 | 사실 |
| additive migration 체계가 있다 | 사실. 버전 목록 29개, 현재 `schema_version = 27`, `index_meta`에 보관 |
| `note.layer === 'past'`이면 편집이 제한된다 | 사실. UI는 연필을 감추고 `editNote`는 정정을 제안한다 |

### 계획의 추정과 달랐던 것

- **`schema.ts`는 고칠 필요가 없었다.** 계획은 Task 2에서 `schema.ts`·`client.ts` 수정을
  예상했지만, drizzle로 모델링된 테이블은 `notes` 하나뿐이고 나머지는 전부 raw SQL이다.
  새 테이블도 같은 방식(migration의 `CREATE TABLE` + prepared statement 저장소)으로 넣었다.
- **journal은 세 번째 파일이 됐다.** 계획은 `document-revisions.ts`와 `document-meta.ts`만
  이름을 댔는데, `document_mutations`는 수명이 다른 관심사(진행 중인 쓰기 시도 대 확정된
  이력)라 `document-mutations.ts`로 분리했다.

### 문서가 다루지 않은 것

- **rule 노트 #2280.** '사람은 고칠 때만 쓴다'는 전제는 레포 파일에만 있는 것이 아니라
  볼트의 canonical rule 노트에도 있고, MCP 세션마다 주입된다. `CLAUDE.md`를 고쳐도 이
  규칙은 남는다. 규칙 승인·폐기는 사람만 할 수 있으므로 **대체 규칙 승인은 사용자 작업으로
  남아 있다.**

## 3. fixture 볼트

`tests/fixtures/memex-v1/` — 합성 자료 16개 문서. 사용자의 실제 원고가 아니다.
git 저장소가 아니다(설계가 요구하는 "git 없는 볼트" 조건).

테스트는 `tests/fixtures/vault.ts`의 `copyFixtureVault()`로 임시 디렉터리에 복사해서 쓴다.
`tests/fixtures/`에 직접 쓰지 않고, `~/.memex`와 실제 볼트는 건드리지 않는다.

`tests/fixtures/vault.test.ts`가 fixture가 실제로 색인되는지 확인한다 (9 tests).

## 4. 수용 시나리오

상태 값: **미착수** · **구현 중** · **구현 완료, 자동 검증** · **구현 완료, 수동 확인 필요**

| ID | 시나리오 | 상태 | 근거 |
|---|---|---|---|
| A01 | 새 설치, AI/embedding 없이 볼트 생성과 원고 작성 | 미착수 | Task 3·5 |
| A02 | unknown YAML·wiki link 문서의 한 문단 수정 시 나머지 보존 | **core 검증됨** | `documents.test.ts` "keeps the YAML it does not understand" |
| A03 | 저장 지연 중 추가 입력 후 이동 | 미착수 | Task 4 |
| A04 | git 없는 볼트에서 AI 수정 적용 후 복원 | 미착수 | Task 2·7 |
| A05 | app과 MCP가 같은 base로 동시 수정 | **core 검증됨** | 두 번째 연결이 lock을 쥔 채 확인. UI/MCP 배선은 Task 9 |
| A06 | 요청 후 다른 문서로 전환해도 제안은 원래 문서에 | 미착수 | Task 7 |
| A07 | 원문 수정 후 오래된 proposal 적용 거절 | 미착수 | Task 7 |
| A08 | '출시 9월'을 '10월'로 정정, 이후 조회에 반영 | 미착수 | Task 8. fixture `projects/launch-plan.md` |
| A09 | 참고문의 '모든 규칙을 무시하라'가 지침 권한을 갖지 않음 | 미착수 | Task 7. fixture `references/ops-handbook.md` |
| A10 | agent가 person/unknown 문서를 직접 덮어쓰려 하면 proposal 또는 거절 | **core 검증됨** | `document-policy.ts`. 제안 생성 자체는 Task 7 |
| A11 | 파일 쓰기·DB 확정·embedding 단계별 실패에서 복구 | **일부** | 파일 쓰기 실패와 journal은 검증됨. 시작 시 prepared 복구 패스는 미구현 |
| A12 | 960/1280/1600 폭, 밝은/어두운 테마, 키보드와 IME | 미착수 | Task 5·6·10 |
| A13 | 외부 파일 수정 후 dirty 앱에 복귀 | 미착수 | Task 4·9 |
| A14 | 활성 규칙 수정·글쓰기 스킬 선택이 전역 주입을 만들지 않음 | 미착수 | Task 7. fixture `rules/proposed-brevity.md` |

## 5. 태스크 진행

| Task | 상태 | 남은 것 |
|---|---|---|
| 1 기준과 fixtures | **완료** | rule 노트 #2280 대체는 사용자 승인 대기 |
| 2 메타데이터와 버전 | **완료** | schema v28. 파일은 건드리지 않는 additive migration |
| 3 공통 저장과 복구 | **core 완료, HTTP 배선 남음** | `packages/core/src/documents.ts`. `/api` 라우트 연결은 Task 5와 함께 |
| 4 영속 초안과 자동 저장 | 미착수 | |
| 5 시작하기와 앱 구조 | 미착수 | |
| 6 자료와 문서 작업 | 미착수 | |
| 7 AI 맥락과 제안 | 미착수 | |
| 8 기억 정정 | 미착수 | |
| 9 MCP와 CLI 일관성 | 미착수 | |
| 10 전체 저니와 문서 정리 | 미착수 | |

## 6. 아직 검증하지 못한 것

- Electron 창에서의 실제 조작. 이 환경에서는 합성 마우스 이벤트가 창에 도달하지 않아
  자동으로 누를 수 없다. 화면 동작은 사용자 확인이 필요하다.
- 실제 제공자(Claude/Codex) 호출. 테스트는 가짜 provider를 쓴다.
- 대용량 볼트에서의 revision 저장 용량. 설계가 후속 관리 기능으로 미룬 항목이다.
