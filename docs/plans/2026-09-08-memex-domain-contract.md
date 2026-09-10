# memex 데이터와 동작 계약 v1

상태: 설계 제안. 아래 타입·경로·테이블은 기존 API로 확인된 항목을 제외하고 제안이다.
관련: [경험 설계](2026-09-08-memex-experience-spec.md), [실행 인수인계](2026-09-08-memex-implementation-handoff.md).

## 1. 구현 사실과 설계 차이

| 현재 확인한 코드 | 이번 설계의 요구 |
|---|---|
| `core/note.ts`와 UI 라우트가 저장·편집을 처리 | 문서 쓰기·기억 쓰기의 의미를 분리하고 공통 서비스에서 검증 |
| 원문 파일과 SQLite 색인, 벡터가 함께 존재 | 파일은 문서 원본, DB는 ID·기억·이력·색인. 색인 오류가 문서 유실이 되어서는 안 됨 |
| `services/ui/history.ts`는 Git log/show 사용 | Git 없는 볼트도 memex 변경 복구 가능. Git 이력은 보조로 유지 |
| `useAutosave`는 유휴 후 저장, unmount에서 비동기 저장 | 영속 초안·쓰기 직렬화·버전 충돌·종료 확인 필요 |
| `note.layer === past`이면 일반 편집 제한 | 사람의 원문 편집과 사건/주장 정정을 다른 연산으로 구분 |
| 외부 폴더는 agent 편집 제한 | 기존 보수적 정책 유지, 사람의 원문 편집도 연결 폴더 권한으로 판단 |
| note body 생성 시 임베딩과 결합 | 기본 작성은 검색 모델 없이 완료, 임베딩은 후속 작업 |

## 2. 논리 모델

기존 `notes.id`를 문서 식별자로 재사용한다. 별도의 전체 문서 저장소를 병렬로 만들지 않는다. 신규 개념은 보조 메타데이터/테이블로 추가한다.

```ts
type DocumentId = number;
type RevisionId = string; // 서비스가 발행한 불투명 버전 ID
type DocumentMeta = {
  id: DocumentId;
  revision: RevisionId;
  kind: 'note' | 'reference' | 'draft' | 'instruction' | 'unknown';
  writingStatus: 'working' | 'finished' | null;
  origin: 'person' | 'external' | 'agent' | 'unknown';
  mode: 'document' | 'legacy-memory';
};
type EvidenceRef = {
  documentId: DocumentId;
  revision: RevisionId;
  quote: string;
  heading?: string;
};
type MemoryView = {
  id: string; // claim:123 / register:456 등 기존 ID를 구분
  subjectKey: string | null;
  statement: string;
  status: 'unconfirmed' | 'confirmed' | 'retired';
  evidenceState: 'current' | 'changed' | 'missing';
  evidence: EvidenceRef[];
  supersededBy: string | null;
};
```

`origin`은 최초 출처이며 AI 수정 수락으로 person으로 바꾸지 않는다. 후속 기여는 revision의 actor에 기록한다. 과거 author가 person으로 기본 채워진 것을 실제 저자 확인으로 취급하지 않는다. `finished`는 작성 상태이며 사실 승인/발행 상태가 아니다.

`MemoryView`는 claims/register 위의 조회 모델이다. 별도 세 번째 사실 테이블을 만들지 않는다. 각 변경 서비스가 원래 저장소에 기록하고 공통 응답으로 변환한다. subjectKey는 기존 명시적 subject ID/문자열을 안정적으로 매핑한다. 기존 태그 유사성만으로 같은 주장을 병합하지 않는다.

## 3. 저장과 메타데이터

- Markdown과 첨부 파일을 사용자가 소유한다. 무관한 YAML 필드, 제목, 링크, 코드 블록, 기존 파일 형식을 보존한다.
- 신규 문서는 파일명 충돌을 피하는 안정적 경로를 쓴다. 제목 변경만으로 파일을 자동 이동하지 않는다.
- 새 문서의 본문이 비어 있어도 편집 과정에서는 유효하다. 자동 기억 저장의 빈 내용 거절은 유지한다.
- 기존 `past/state/rule`은 기존 메모리 호출 계약에 남긴다. 신규 직접 작성 문서는 문서 모드이며 사용자에게 layer 입력을 요구하지 않는다. 기술적 기본값이 필요하면 state를 쓰되, mode=document인 것만으로 주장/규칙 추출을 실행하지 않는다.
- 신규 문서의 기본 kind는 note. AI가 새 원고를 생성하면 draft, 명시적으로 자료를 가져오면 reference. 기존 문서는 증거가 없으면 unknown.
- 문서의 kind·mode·origin 등 portable 정보는 신규/명시 수정 문서에 namespaced frontmatter로 저장할 수 있다. 기존 외부 파일은 일괄 변경하지 않고 DB sidecar 메타데이터로 시작한다. 이 경우 DB 없는 재가져오기에서 일부 속성이 unknown으로 돌아감을 명시한다.
- 재색인은 문서 ID와 보조 메타데이터/이력을 보존한다. 색인 재구축은 DB 삭제와 다른 연산이다. 기억/이력까지 담긴 DB를 단순 캐시라고 안내하지 않는다.
- v1 백업 단위는 볼트 파일 + SQLite의 일관된 스냅샷 + 설정/추가 소스 목록이다. API 토큰을 백업 산출물에 포함하지 않는다. 파일 이력만으로 완전한 볼트 복원을 보장하지 않는다.

## 4. 최소 신규 영속 데이터

이름은 제안이며 기존 테이블과 겹치면 합친다. 먼저 migrations/schema를 확인한다.

| 데이터 | 목적과 필수 필드 |
|---|---|
| document_meta | document_id, mode, kind, origin, writing_status, current_revision |
| document_revisions | revision_id, document_id, parent_revision, raw_content, file_hash, actor, at, mutation_id, reason |
| document_mutations | mutation_id unique, document_id, expected_revision, intended_hash, stage, result_revision, error |
| document_drafts | vault_id, document_id 또는 draft_id, base_revision, content, sequence, at |
| document_references | owner_document_id, source_document_id, source_revision, quote, optional heading |
| change_proposals | id, document_id, base_revision, scope, replacement, evidence_refs, status, origin_client |

문서 revision은 완전한 원문 복구를 위한 데이터이며 UI에서 보이지 않는 frontmatter도 포함한다. 기존 git history는 별도 출처로 보여준다. v1은 이력을 자동 삭제하지 않는다. 용량과 보존 정책은 후속 관리 기능으로 정의하며 운영 전 대용량 fixture로 확인한다.

## 5. 공통 서비스 경계

```text
Desktop UI → local API adapter ─┐
MCP tools → MCP adapter ────────┼→ document / memory / policy services
CLI commands → CLI adapter ────┘              │
                                      Markdown + SQLite
                                             │
                               FTS / embeddings / derived views
```

순수 읽기/쓰기와 정책은 `packages/core` 중심으로, DB 저장은 `packages/db`에 둔다. 모델 실행·로그인·Electron 파일 선택 등 호스트 의존 동작은 기존 앱 서비스에 남긴다. 공통 로직을 분리한다는 이유로 LLM 실행까지 core에 넣지 않는다. 새 네트워크 서버나 항상 켜진 앱은 요구하지 않는다.

MCP 진입점은 현재 `await createEmbedder(...)` 이후 도구를 등록한다. 모델 미준비 상태에서도 읽기/문서 쓰기가 가능하도록 등록과 모델 로딩을 분리한다. UI의 `createModelRunner`와 동등한 준비 상태를 공유하되 Electron에 의존하지 않는다. 기본 저장을 무모델로 바꾸고도 프로세스 시작에서 다운로드를 기다리는 불일치를 남기지 않는다.

공통 연산:

- `readDocument(id)` → raw/body/meta/revision/capabilities.
- `createDocument(input, context)` → id/revision, 모델 준비와 무관.
- `updateDocument(id, expectedRevision, mutationId, edit, context)` → 새 revision 또는 conflict.
- `proposeDocumentChange(...)` → 변경 제안, 원문 불변.
- `applyDocumentChange(proposalId, context)` → base revision 재검증 후 update.
- `correctMemory(target, expectedState, replacement?, reason?, mutationId, context)` → 판정/새 값/근거/이력.
- `restoreDocument(id, revisionToRestore, expectedCurrentRevision, context)` → 과거 내용으로 새 revision 생성.

## 6. 쓰기 프로토콜과 실패 복구

문서 파일과 SQLite는 하나의 원자적 트랜잭션이 아니다. 다음 프로토콜을 적용하고 오류 주입 테스트로 복구를 확인한다.

1. 호스트가 actor/허용 범위를 결정한다. 요청 body의 `actor=user`를 신뢰하지 않는다.
2. memex 프로세스 사이의 문서별 쓰기를 직렬화한다. 단일 프로세스 Promise queue만으로 MCP/앱/CLI 경합을 해결했다고 보지 않는다. DB 조정과 짧은 파일 쓰기 구간을 사용하고 모델 호출 동안 쓰기 잠금을 잡지 않는다.
3. 실제 파일 hash와 DB revision을 비교한다. 외부 변경이면 그 원문을 revision으로 수용하고 기존 base 요청에 conflict를 반환한다.
4. `expectedRevision`이 최신인지 검사한다. mutationId가 이미 완료됐으면 기존 응답을 반환해 재시도 중복 적용 방지.
5. 현재 원본과 의도된 결과를 revision/journal에 영속화하고 stage=prepared를 기록한다.
6. 같은 디렉터리 임시 파일을 사용해 손상 없는 교체를 수행한다. 지원 플랫폼에서 rename/flush 의미를 검증한다.
7. DB의 현재 revision과 FTS를 갱신하고 mutation=committed. 임베딩은 revision별 후속 작업으로 예약한다.
8. 시작/재접속 시 prepared journal을 actual hash와 대조한다. old이면 미완료, intended이면 DB 완료, 둘 다 아니면 외부 경합으로 보존·표시한다. 임의로 원문을 되돌리지 않는다.

외부 에디터는 memex 잠금을 따르지 않는다. hash 확인과 rename 사이의 경쟁을 완전히 막는다고 보장하지 않는다. watcher/읽기 시 hash 재검사와 관측된 버전 보존으로 감지·복구 범위를 높인다. 관측 전에 덮인 외부 쓰기까지 복원 가능하다고 안내하지 않는다.

파일 저장 성공 후 임베딩 실패는 ‘저장됨 · 뜻 검색 갱신 대기’. 이전 revision의 임베딩을 최신 문서로 표시하지 않는다. 해당 문서는 최신 FTS로 찾고 임베딩 재시도 큐에 남긴다. 파일 쓰기 실패는 성공 응답을 보내지 않는다. 중간 DB 실패는 journal 복구 후 응답을 재확인한다.

## 7. 초안과 자동 저장

편집 버퍼와 저장된 revision을 분리한다. 문서별 증가하는 sequence로 늦게 도착한 응답이 최신 입력을 clean 처리하지 못하게 한다. 저장 중 새 입력이 오면 다음 쓰기로 이어진다.

document_drafts는 debounced file save와 별도로 최신 복구 상태를 영속화한다. 창 닫기 이벤트에서 마지막 sequence의 영속화/저장을 확인한다. 강제 종료나 디스크 장애 직전 아직 영속화되지 않은 키 입력까지 보장하지 않는다. 복구 시 ‘저장되지 않은 편집이 있어요’로 원문과 초안을 비교하고 복원/버리기를 선택하게 한다.

새 draft_id는 첫 생성의 idempotency key가 된다. 사용자가 입력하고 이동했을 때 서버 생성 응답이 늦어도 중복 파일을 만들지 않는다. vault_id는 경로만이 아니라 설정에서 안정적으로 부여하고 볼트 전환 시 탭/초안/대화를 분리한다.

## 8. 권한과 기존 메모리 계약

| 요청 | v1 정책 |
|---|---|
| 사용자의 직접 문서 편집 | 허용된 볼트/폴더에서 허용, 이전 버전 보존 |
| legacy past의 원문 편집 | 앱의 명시적 ‘원문 편집’으로 가능. 사건 자체 정정은 별도. mode/layer를 몰래 변경하지 않음 |
| agent가 legacy past를 의미적으로 수정 | 기존 제한 유지, 정정 연결을 사용 |
| agent가 person/unknown 문서를 변경 | 기본 제안만. 신뢰된 UI 적용 또는 사용자가 설정한 명시적 쓰기 범위에서 적용 |
| agent가 자기 draft를 변경 | 허용된 범위 + expectedRevision 필수. 사용자 편집 기여가 생기면 기본은 제안 |
| 기존 state 메모리 갱신 | 기존 허용 범위를 유지하면서 같은 revision/journal로 저장 |
| 전역 rule 생성/갱신 | 제안은 가능, 활성화는 사람. 활성 규칙 수정은 재검토 전 새 내용을 자동 주입하지 않음 |
| 이번 작업의 글쓰기 스킬 선택 | 해당 세션/문서 요청에만 적용, 전역 승인과 별개 |
| 추가 참고 폴더 | 기본 읽기. 앱의 직접 편집 권한은 명시 설정, 외부 agent 쓰기는 기본 금지 |

CLI는 로컬 도구라고 모든 호출을 사용자 승인으로 간주하지 않는다. 기본 제한을 적용하고, 실제 터미널에서 명시한 사용자 작업을 구분할 수 있는 어댑터 계약을 만든다. MCP의 `confirmed:true`만으로 사람 승인이나 user actor를 만들어내지 않는다.

## 9. MCP와 API 변경 계약

기존 검색/읽기/저장 도구를 우선 확장한다. UI와 이름이 비슷한 두 번째 검색 도구 모음을 만들지 않는다.

| 도구 | 확장 |
|---|---|
| get_note | revision, mode, 출처, 권한, 기억 현재성 반환 |
| search_notes | 문서/기억 종류 필터와 출처, 현재성. 기존 결과 포맷 호환 유지 |
| save_note | 기존 layer 메모리 저장 유지. 문서 생성 모드를 선택적으로 추가하고 이때 layer/메모리 템플릿 요구 안 함 |
| update_note | expected_revision, mutation_id, operation=edit-document/propose-document-change/correct-memory 등 판별 가능한 union. 대상 권한에 따라 직접 적용 또는 제안 |
| set_register | 동일 정정·버전 계약으로 연결 |

정정 전용 도구를 새로 만들지는 않는다. update_note의 legacy 파라미터와 operation을 동시에 보내면 명확한 오류를 반환한다. claim/register 대상 구분은 kind+id로 받는다. 새 schema와 에러 예시를 MCP 서버 지침에 함께 배포한다.

호환 한계: 기존 legacy 메모리 호출 형식은 지원하지만, 새 문서 쓰기는 revision 없는 요청을 `REVISION_REQUIRED`로 거절한다. 오래된 클라이언트에 무조건 stale-write 보호가 생긴다고 주장하지 않는다. user-authored 문서 보호는 과거 느슨한 agent 편집보다 의도적으로 엄격하며 릴리스 노트에 알린다.

제안 HTTP 확장:

- 기존 GET `/api/note/:id`에 revision/meta/capabilities 추가.
- 기존 POST `/api/notes`, `/api/note/:id`에 문서 operation을 판별 가능하게 추가. legacy 루트 전체를 병렬 구현하지 않는다.
- GET `/api/library`, GET `/api/memory`, GET `/api/memory/:subjectKey`.
- POST `/api/memory/:kind/:id/correct` — expectedState/replacement 또는 retire/reason/mutationId.
- GET `/api/note/:id/revisions`, POST `/api/note/:id/restore`.
- 기존 `/api/chat`, `/api/chat/apply`는 context manifest와 proposal revision을 추가.
- GET `/api/changes?after=cursor`로 볼트 변경 세대와 변경 ID를 조회. 활성 창에서는 짧은 주기로 확인하고 포커스 복귀 때 즉시 확인. dirty 문서는 교체하지 않고 충돌 처리.

라우터의 기존 `/api/note/*` catch-all보다 세부 경로를 먼저 매칭한다. HTTP status: 409 version-conflict, 403 write-not-allowed, 404 not-found, 503 provider-unavailable. errors는 번역 가능한 code와 currentRevision 등 회복 정보를 포함한다.

## 10. AI context와 제안 계약

```ts
type ContextManifest = {
  target: { documentId: number; revision: string } | null;
  selection: { from: number; to: number; exactText: string } | null;
  referenceIds: number[];
  instructionIds: number[];
  searchScope: 'selected' | 'allowed-vault';
};
type ChangeProposal = {
  id: string;
  documentId: number;
  baseRevision: string;
  range: { from: number; to: number; exactText: string } | null;
  replacement: string;
  usedEvidence: EvidenceRef[];
  status: 'pending' | 'applied' | 'discarded' | 'conflicted';
};
```

offset은 CodeMirror와 같은 UTF-16 code unit 기준의 편집 본문 좌표다. 원시 파일의 YAML offset과 혼용하지 않는다. 적용 전 exactText와 baseRevision을 재검증하고 보존 로직으로 원문을 재조립한다.

제공자의 context 한도 초과 시 필요한 구절만 선정하고 실제 전달 manifest에 반영한다. 사용자가 지정한 필수 대상/지침을 조용히 누락하지 않는다. 맞지 않으면 범위를 줄이도록 오류를 반환한다. 문서의 지시문은 reference이고, 명시된 지침만 instruction으로 취급한다.

요청의 target과 context는 전송 시 스냅샷이다. 이후 탭 전환은 바꾸지 않는다. 취소는 기존 cancel 프로토콜을 사용하며 미리보기 생성과 원문 쓰기를 분리한다.

## 11. 기억 정정과 파생 정보

기억 정정은 target 상태를 비교하고 이전 주장 폐기/새 주장/관계/이벤트를 같은 DB transaction에 기록한다. 증거 문서 작성이 필요하면 문서 journal을 먼저 완료한 후 그 revision을 근거로 연결한다. 부분 실패 시 unlinked 문서가 남을 수 있으므로 재시도는 mutationId로 재사용한다.

원문 편집 → 근거 버전이 바뀌었다는 표시. 문서 편집만으로 대체 사실을 발명하지 않는다. 새 글 작성 → 기본적으로 문서만 저장. ‘현재 결정으로 기억’이라는 명시적 의도 또는 허용된 메모리 캡처 경로에서만 추출한다.

사용자 확인은 confirmedAt/출처가 있는 사건이다. 검색 시 폐기 상태를 표시하고 관련 정정으로 안내한다. 이전 기록은 역사 질문에 반환할 수 있지만 현재 사실로 소개하지 않는다. 기존 note body에 틀린 구절이 남더라도 MCP의 warning/standing과 최신 근거가 함께 전달돼야 한다.

## 12. 호환과 마이그레이션 순서

1. 변경 전 SQLite 스냅샷과 샘플 볼트 준비. 실제 사용자 볼트에서 destructive test 금지.
2. additive schema, 안정적 ID와 nullable/default=unknown 메타데이터. 이전 파일을 일괄 rewrite하지 않는다.
3. 처음 원문 편집하는 순간 현재 파일을 baseline revision으로 저장. 기존 Git 이력이 없던 기간의 이력을 만들어내지 않는다.
4. 새 문서 저장과 직접 편집을 공통 서비스로 전환. 템플릿 요구/빈 본문은 문서 모드에서만 완화.
5. MCP/CLI의 쓰기를 같은 프로토콜로 연결. 기존 읽기 경로와 결과를 회귀 검증.
6. 사용자 문서와 AI 초안/legacy 기억을 샘플로 확인하고, UI의 메타데이터 표시를 활성화.

롤백은 신규 데이터를 모르는 구버전 바이너리를 그냥 실행하는 것이 아니다. UI 기능을 비활성화해도 안전한 저장 어댑터는 유지한다. DB 복원은 같은 시점의 파일/설정과 맞추며, 새 편집을 먼저 내보낸 뒤 진행한다. destructive migration은 이번 범위에 없다.
