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
Task 9 이후 (최종): `yarn test` **1510 passed · 4 skipped · 0 failed**,
`yarn typecheck` 20/20, `yarn build` 11/11. `schema_version` 27 → **31**.

기준선 1325 → 1510. 새 실패 없음. 기존 실패도 없었으므로 회귀 없음.

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
| A01 | AI/embedding 없이 볼트 생성과 원고 작성 | **자동 검증** | `tests/acceptance.test.ts`. 쓰기 뒤에도 임베딩이 그대로 = 저장이 모델을 기다리지 않음 |
| A02 | unknown YAML 문서의 한 문단 수정 | **자동 검증** | fixture `notes/unknown-yaml.md`로 왕복 |
| A03 | 저장 지연 중 추가 입력 후 이동 | **자동 검증** | `save-queue.test.ts` |
| A04 | git 없는 볼트에서 복원 | **자동 검증** | `.git`이 없음을 확인한 뒤 restore |
| A05 | app과 MCP가 같은 base로 동시 수정 | **자동 검증** | 두 번째 연결이 conflict, 파일은 첫 번째 것 |
| A06 | 요청 후 탭 전환해도 제안은 원래 문서에 | **자동 검증** | `proposals.test.ts` |
| A07 | 원문 수정 후 오래된 proposal 적용 거절 | **자동 검증** | base-moved + text-moved 둘 다 |
| A08 | '9월'을 '10월'로 정정 | **자동 검증** | 다음 조회가 10월, register_events는 2건 |
| A09 | 참고문의 '모든 규칙을 무시하라' | **자동 검증** | `context.test.ts`. role이 reference로 고정 |
| A10 | agent가 person 문서 덮어쓰기 시도 | **자동 검증** | propose-instead, 파일 불변 |
| A11 | 파일 쓰기·DB·embedding 단계별 실패 | **자동 검증** | `recovery.test.ts`가 세 갈래를 다 돌린다 |
| A12 | 960/1280/1600 폭, 테마, 키보드, IME | **미검증** | 창을 열어봐야 함. 아래 6절 |
| A13 | 외부 파일 수정 후 dirty 앱에 복귀 | **일부** | core가 발견·보존·거절. **화면의 비교 UI는 미구현** |
| A14 | 활성 규칙 수정이 전역 주입을 만들지 않음 | **일부** | 고르지 않은 글쓰기 스킬은 주입 안 됨(검증). rule 승인 경로는 손대지 않음 |

## 5. 태스크 진행

| Task | 상태 | 남은 것 |
|---|---|---|
| 1 기준과 fixtures | **완료** | rule 노트 #2280 대체는 사용자 승인 대기 |
| 2 메타데이터와 버전 | **완료** | |
| 3 공통 저장과 복구 | **완료** | |
| 4 영속 초안과 자동 저장 | **완료** | IME·강제 종료 복구는 Electron 수동 확인 |
| 5 시작하기와 앱 구조 | **완료** | 홈의 '관련된 변경'은 아직 빈 배열 |
| 6 자료와 문서 작업 | **완료** | |
| 7 AI 맥락과 제안 | **일부** | manifest 화면 표시·지침 선택 완료. 제안 미리보기는 옛 구조 |
| 8 기억 정정 | **완료** | |
| 9 MCP와 CLI 일관성 | **완료** | update_note·get_note·lazy embedder·CLI actor 어댑터 |
| 10 전체 저니와 문서 정리 | **완료** | 수용 시나리오 자동 검증분 실행됨 |

## 5-1. 계획과 달라진 구현 결정

- **`/api/note/:id/revisions`를 catch-all 위로 올려야 했다.** 계약 §9가 경고한 그대로,
  기존 `GET /api/note/*`가 먼저 잡아서 테스트 2개가 깨졌다.
- **`document_references`는 `(owner, source)`가 유일하다.** 같은 자료를 두 번 붙이면
  한 줄이 갱신된다. 계약은 중복 처리를 요구했지만 방식은 정하지 않았다.

- **`/api/buffer/:key`.** 계약은 초안 경로를 정하지 않았는데, `/api/draft/:id`는 이미
  에이전트가 준비한 재작성이 쓰고 있었다. 그대로 얹었더니 기존 테스트 2개가 깨져서 잡혔고,
  사람의 편집 버퍼는 다른 단어를 받았다.
- **`document_locks`.** 계약 §6-2가 "프로세스 사이 직렬화"를 요구하지만 방법은 정하지
  않았다. 세 프로세스가 이미 붙어 있는 SQLite에 락 테이블을 뒀고, 30초 뒤 만료된다.
  죽은 프로세스가 문서를 영영 못 쓰게 만들면 안 되기 때문이다.
- **`busy`는 예외가 아니라 결과값.** 나머지 모든 결과가 반환값인데 하나만 throw이면
  처리를 빠뜨리게 된다.

## 6. 아직 검증하지 못한 것

**화면을 한 번도 보지 못했다.** 합성 마우스 이벤트가 Electron 창에 도달하지 않고(권한),
검증을 시도한 시점에 기기가 잠겨 있었다. 아래는 전부 사용자 확인이 필요하다.

- A12 전체 — 폭 3종, 밝은/어두운 테마, 키보드 이동, 한국어 IME 조합
- 라이브러리·기억·참고 패널이 실제로 그려지는지
- 창을 닫을 때 handshake가 실제로 창을 붙잡는지
- 강제 종료 후 초안 복구

**실제 제공자 호출은 없다.** 테스트는 전부 가짜 embedder/provider를 쓴다.
Claude/Codex로 실제 요청을 보낸 적이 없다.

**대용량 볼트에서의 revision 용량**은 재보지 않았다. 설계가 후속 관리 기능으로 미룬 항목이다.

## 7. 적용된 마이그레이션

| 버전 | 이름 | 무엇 |
|---|---|---|
| 28 | documents.meta_revisions_mutations | `document_meta`, `document_revisions`, `document_mutations`, `document_locks` |
| 29 | document_drafts | 편집 버퍼 영속화 |
| 30 | document_references | 버전 달린 참고 관계 |
| 31 | change_proposals | AI가 제안한 변경 |

전부 additive다. 기존 파일을 읽거나 고치지 않으며, fixture 볼트 해시 비교로 확인했다.

## 8. 남은 문제

1. ~~**시작 시 prepared journal 복구 패스가 없다**~~ 2026-09-10 해결. 앱과 MCP가 볼트를
   열 때 `recoverInterruptedWrites`가 돈다. 디스크 해시로 세 가지를 가른다 — 디스크에
   닿지도 못한 쓰기 / 디스크만 끝난 쓰기(DB가 따라감) / 다른 것이 먼저 쓴 경우(그 원문을
   보존하고 재생하지 않음).
2. ~~**에디터가 `raw`를 보내지 않는다.**~~ 2026-09-10 해결. 본문 편집은 이제
   `{ body, expectedRevision, mutationId }`로 문서 경로를 타고, 프론트매터는 서버가
   다시 붙인다. `past` 원문 편집이 되고 연필이 켜졌다. 제목·태그·layer는 여전히 옛 경로.
3. ~~**Chat 화면이 context manifest를 쓰지 않는다.**~~ 2026-09-10 해결. 입력 위에
   대상·참고·지침·제공자가 표시되고, 지침은 고른 것만 적용된다. 제안을 화면에서
   미리보고 적용하는 UI는 아직 옛 preview/apply 구조를 쓴다.
4. ~~**홈이 그대로다.**~~ 2026-09-10 해결. '이어서 작업하기'와 '최근 수정한 문서'가
   앞에 오고 확인 덱은 그 아래로 내려갔다. 홈의 '작업과 관련된 변경' 섹션은 아직
   빈 배열을 돌려준다(설계는 근거 변경·충돌 최대 3개).
5. ~~**CLI `add`/`edit`이 공통 정책을 우회한다.**~~ 2026-09-10 해결. `actorOf()`가
   TTY 유무로 가른다 — 사람이 치는 터미널이면 `user`, 스크립트·CI·에이전트가 띄운
   셸이면 `agent`. 로컬이라는 게 사용자라는 뜻은 아니다.
6. **rule 노트 #2280**이 볼트에서 여전히 canonical이다. 사람만 대체할 수 있다.
