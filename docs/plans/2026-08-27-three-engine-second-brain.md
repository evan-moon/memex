# 세 엔진 — 수십만 개에서도 기억이 거짓말하지 않게

> `2026-08-26-discovery-supply.md`가 "발견은 월 3~4건이라 화면이 아니라 알림"으로 끝났다.
> 그 다음 사용자가 목표를 다시 정의했다 — **수십만 개의 의미론적 연결, 과거와 현재의 표현,
> 그리고 제3의 영감.** 이 문서는 그 셋을 한 메커니즘으로 풀 수 없다는 결론과, 대신 무엇을
> 나눠야 하는지를 적는다.
>
> Claude Opus 5와 Codex(gpt-5.6-sol)의 4라운드 논의 결과다. 양쪽이 각각 넷씩 철회했다.

## 0. 지금 규모

노트 1,382 · `past` 1,125 · `state` 244 · `rule` 12 · 청크 17,000 · 링크 1,298.
**1,382개 중 사람이 손으로 쓴 것은 3개.** 하루 6.6개가 대화 끝에 자동 저장된다.
목표는 100~200배다.

## 1. 목표와 비목표

### 목표

1. **규모에서 회수한다** — 사람이 절대 읽을 수 없는 양에서 관련 과거를 꺼낸다
2. **과거와 현재를 함께 표현한다** — 지금 무엇이 맞는지, 그게 어떻게 바뀌어 왔는지
3. **묻지 않은 연결을 제안한다** — 제한된 검토 시간 안에서

### 핵심 지표

**`수용된 유용한 결과 / 검토 시간`.**

논의에서 가장 중요했던 재정의가 이것이다 — **진짜 제한 자원은 저장 공간이 아니라 사용자의
검토 시간이다.** 목표는 "더 많은 카드"가 아니라 "같은 주의력으로 더 높은 가치". 이 지표가
없으면 세 목표가 전부 "많이 보여주기"로 붕괴한다.

보조 축 셋:
- **시간적 자기교정** — tip 정확도, 낡은 답 누출률, 정정 후 옛 주장이 단독 노출되는 비율
- **출처 유지** — inference evidence 정밀도, 원문 추적 가능 비율, 근거 변경 시 무효화 recall
- **주의력 증폭** — 수용된 통찰당 검토 시간, accept 비율, dismiss 후 재노출률

### 비목표

- `C(n,2)` 열거 — 10만 개면 5×10⁹ 쌍이다. 오늘 LLM 판정이 쌍당 5.5초였으니 직렬 871년
- 쌍마다 LLM
- 자동 의미 병합 — 계산은 의미를 합성하지 않는다
- 매일 채워야 하는 홈 피드

## 2. 세 엔진의 경계

**하나의 정본 이벤트 스토어, 세 개의 read model.** 세 목표는 스케일링 법칙이 달라서 한
인덱스로 못 서빙한다.

| 엔진 | 담당 | 복잡도 |
|---|---|---|
| **Memory** | 불변 payload · 명시적 관계 · 병합하지 않는 narrative | O(n) |
| **Current-state** | `(subject, predicate, scope)` register · 결정론적 fold | O(stream 길이) |
| **Connection** | Identity / Semantic-neighborhood / Hypothesis bridge | 가능 공간 O(n²), 알고리즘 O(n·k) |

### 의미 연결은 한 종류가 아니다

이 구분을 놓치면 셋이 같은 `note_links`로 뭉개진다.

| 층 | 무엇 | 어디 사는가 |
|---|---|---|
| **Identity edge** | 같은 register/stream의 이전 버전, revision, scope | **정본** (frontmatter) |
| **Semantic-neighborhood edge** | 유사도, 공유 엔티티, co-retrieval | 재계산 가능한 **인덱스** |
| **Hypothesis bridge** | 서로 다른 cluster를 잇는 시스템 제안 | provenance 있는 **가설** |

`hidden_arc`(`packages/db/src/signals.ts:502`)가 이미 셋째의 원형이지만 **같은 주제의 숨은
연속성만 찾고 cross-domain bridge는 못 찾는다.**

## 3. 정본과 파생의 분리선

| 정본 | 파생 |
|---|---|
| Markdown 본문 | tip, 임베딩, kNN |
| 명시적 관계(`derives_from`, predecessor) | semantic edge, candidate score |
| register key | signal, nomination bundle |
| predicate registry (append-only) | |
| 제시·수용·기각 이벤트 | |

**추론된 엣지를 frontmatter에 되쓰지 않는다.** 파일 churn을 만들고 self-poisoning 경로가
열린다. `2026-08-21-state-as-projection.md`의 "frontmatter 정본 / DB 파생" 원칙을 유지하되
**범위를 좁힌다** — event ID·stream·scope·명시적 근거만 정본이다.

## 4. Register 모델

### 두 종류의 stream

| | 무엇 | 어떻게 읽나 |
|---|---|---|
| **register** | 구조화된 단일 값·상태 | 결정론적 fold — 같은 `(subject, predicate, scope)`의 마지막 `set` |
| **timeline** | 서술형 이벤트 | **병합하지 않고 정렬된 원문 묶음으로** |

논의 초기에 "후속 스냅샷은 현재 상태를 완전히 표현해야 한다"는 불변조건이 제안됐다가
**철회됐다.** 이유 셋:

1. **기계가 판정할 수 없다.** 폴더·태그·링크 해석은 결정론적으로 검사되지만 "완전한가"는 아니다
2. **비용이 단조 증가한다.** stream이 길어질수록 매 저장이 이전 전체를 재서술해야 한다
3. **에이전트가 회피한다.** 규약이 무거워지면 "저장 안 함"이 늘고, **저장되지 않은 대화는
   복구할 수 없다**

자유 형식 delta+fold도 탈락했다 — "무엇이 바뀌었나"를 판정하려면 LLM 의미 병합이 되고,
그건 `state-as-projection`이 거부한 model collapse 경로다. **typed register에만 fold를
허용한다.** 거기서는 fold가 의미 판단이 아니라 "같은 키의 마지막 `set` 고르기"라는 구조적
계산이기 때문이다.

### 주소 지정 — ID가 아니라 키로

10만 개에서 에이전트는 무엇이 존재하는지 모른다. `update_note(1975)`는 호출자가 #1975의
존재를 알 때만 성립하고, 그 전제가 규모와 함께 무너진다.

```
set_register(subject=opula, predicate=trial.duration, scope=global, value="14 days")
```

시스템이 `(subject_id, predicate_id, scope)`로 현재 tip을 찾아 append한다.
**호출자는 이전 ID를 몰라도 된다.**

### `scope` — replacement를 제한하는 기계 검증 가능한 경계

초기엔 `global | period` 둘만. 자유 문자열 금지.

- `global`은 start/end 없음, `period`는 유효한 ISO 구간 필수
- predecessor·successor는 scope가 **정확히 같아야** 한다
- scope가 다른 이벤트는 서로 supersede **불가**
- scope를 모르면 unscoped timeline event로 저장하고 투영하지 않는다

**월말 결산 문제가 여기서 풀린다.** `2026-05 결산`과 `2026-06 결산`은 같은 태그·형식·라벨을
공유해도 `scope`가 달라서 replacement chain으로 연결되지 않는다. 반대로 5월 결산의 수치
오류를 고친 이벤트는 같은 5월 scope라 predecessor가 될 수 있다.

### 불변조건

1. 현재값은 "가장 최근"이 아니라 **후속 이벤트가 없는 tip**이다
2. 같은 predecessor에서 둘이 나오면 timestamp로 고르지 않고 **fork로 취급**한다
3. `follows` 대상은 같은 stream·같은 scope여야 한다
4. **false split은 일시 허용하되 false merge는 막는다**
5. predicate가 안정적이지 않으면 억지로 register화하지 않고 timeline으로 내려간다

## 5. Predicate Registry — 어휘가 드리프트해도 망가지지 않게

### 문제는 이미 실재한다

태그 70개(20회 이상 사용) 안에서:

```
toss (223)                    토스 (210)
JavaScript (78)               자바스크립트 (21)
Functional Programming (43)   함수형 프로그래밍 (21)
TypeScript (17)               typescript (23)
Category Theory (28)          카테고리 이론 (14)   범주론 (1)
```

**1,382개 시점에 이미 이렇다.** predicate를 에이전트가 자유 생성하면
`trial.duration` / `trial_length` / `트라이얼기간`이 공존하고, tip이 갈라져 register의
존재 이유가 사라진다. 그런데 사람 큐레이션은 수십만 규모에서 불가능하다.

### 답 — 격리하고, 결정 가능한 것만 자동으로, 확인은 답이 갈릴 때만

```
predicate_id            불투명 identity
predicate_label         표시용
predicate_alias         문자열 → ID
predicate_equivalence   두 ID가 같다는 명시적 선언 (append-only)
status                  provisional | canonical | deprecated
```

- **새 predicate는 거부하지 않는다.** 정규화(NFKC·대소문자·공백·하이픈) 후 확정 alias와
  정확히 일치하면 기존 ID, 아니면 **`provisional`로 독립 ID를 만들고 저장은 항상 성공**시킨다.
  호출자에게 ID·상태·유사 후보를 돌려준다
- `provisional`도 자기 ID 안에서는 정상적으로 tip을 계산하지만, 유사 predicate와 자동으로
  합쳐 "유일한 현재값"이라 주장하지 않는다. **충돌 가능성이 있으면 fork를 함께 보여준다**
- **자동 alias는 의미 지식이 필요 없는 경우만.** 번역(`Category Theory`↔`범주론`),
  브랜드 표기(`toss`↔`토스`), 개념적 유사성(`memex`↔`second-brain`)은 자동 병합하지 않는다.
  현재 태그 코드도 같은 경계를 지킨다(`packages/utils/src/tags.ts:1`)
- **사람 확인은 JIT.** 전체 어휘 큐를 관리하게 하지 않고, 두 fork가 **현재 답을 바꿀 때**,
  같은 subject/scope에서 상충값이 생겼을 때, 반복 사용되는 provisional을 승격할 때만 묻는다
- **병합은 과거 이벤트를 수정하지 않는다.** equivalence를 추가할 뿐이고, 원래 label은
  보존하며 파생 register view만 재계산한다

> "predicate를 첫 등장 노트의 `event_id`로 정의하자"는 안은 기각됐다 — 어휘의 생명주기가
> 특정 사건에 종속되고, import 순서에 따라 identity가 달라지며, 병합 시 대표 이벤트를
> 다시 정해야 한다.

## 6. Nomination — 10만 개에서 무엇을 후보로 올리나

가능 공간이 `n²`여도 알고리즘이 `n²`일 필요는 없다. inverted index, ANN top-k, sparse
graph, seed expansion, blocking으로 `O(n·k)`에 묶인다.

### 단일 임베딩 지명기는 이미 정밀도 한계다

오늘 실측: 벡터 지명 75쌍 중 **68%가 UNRELATED.** 그리고 거리 임계를 0.35→0.45로 넓히면
후보가 **63→537로 폭증**한다(`2026-08-22-engine-v2.md`). **threshold 조정이 답이 아니다.**

답은 **inductive bias가 서로 다른 여러 nominator를 제한된 후보 예산 안에서 운영**하는 것이다.

### 초기 예산

```
structural bridge   60%   sparse graph 위의 community 경계 노드,
                          중간 거리 + 반복 co-retrieval. 독립 신호 2개 이상 요구
live context        30%   현재 세션의 query·retrieved note를 seed로 1~2 hop
exploration         10%   무작위. baseline이자 exploitation 편향 방지
historical          0%    피드백이 쌓이기 전까지
co-retrieval
```

실측 최적이 아니라 **초기 실험 정책**이다. 실제 제시 100건 + arm별 명시적 반응 30건 이상이
쌓인 뒤 `수용된 영감 / 검토 시간` 기준으로 재배분한다(탐색 10%는 유지).

**historical co-retrieval을 0%로 시작하는 이유는 신호가 오염돼 있어서다.**

```
surface   rows    고유 질의
recall    2937    53        ← 데몬. 프롬프트마다 자동 호출
mcp         55     5        ← 실제 사용자 검색
cli         18     2
```

**97.6%가 데몬이다.** 가중치를 낮춰도 전체 통계를 지배하므로 **관심 모델에서 완전히
배제한다.** `recall`은 검색 품질·데몬 운영 진단에만 쓴다.

그리고 `retrieval_log`는 `(query, note_id, rank, surface, at)`뿐이라 **의도와 결과를 구분할
자리가 없다**(`packages/db/src/retrieval-log.ts:3`). `initiator=user_explicit |
agent_assisted | daemon` 칼럼이 필요하다.

- **시간 축은 독립 nominator가 아니다.** "오래 안 만난 둘"만으로는 무의미하다 — 오늘 `amends`
  실측에서 시간이 정정 여부를 예측하지 못했다(같은 날 43% / 1–2일 36% / 3일+ 50%).
  relevance를 먼저 만들고 시간으로 surprise를 **올리는** modifier로만 쓴다
- **LLM은 nominator가 아니라 judge다.** 상위 후보 소수에만.

## 7. Presentation과 Feedback

**홈 피드를 만들지 않는다.** 월 3~4건짜리를 매일 보여줄 화면은 이미 기각됐고, 그렇다고
피드백을 안 모을 수도 없다. 해결은 **작업 흐름 안의 inline suggestion**이다.

저장 직후 최대 한 개 signal을 반환하는 자리가 이미 있다(`packages/core/src/note.ts:217`).
Connection Engine의 실험 채널로 그걸 쓴다.

- 사람이 참여한 검색·저장·회고 세션 **뒤에만** 제시
- **세션당 최대 1건, 주 2건 상한**
- 원하면 3~5건 batch review 제공
- 같은 pair/neighborhood는 dismiss 후 재제시 안 함

### 기록해야 하는 것

`retrieval_log` 확장이 아니라 **별도 append-only feedback event**:
candidate ID, nominator arm, 제시 시각·표면·trigger, `accepted|dismissed|deferred|ignored`,
검토 시간, 승격 여부.

**`ignored`를 `dismissed`로 해석하면 안 된다.** 지금 signal에는 `new/snoozed/dismissed/minted`는
있지만 **"실제로 제시됐는가"가 없다**(`apps/mcp/src/tools/signals.ts:28`).

수용된 bridge도 즉시 정본 관계로 만들지 않는다. **가설로 먼저 보여주고 승인 시에만 inference로
mint한다** — 기존 MCP에 이미 이 hard gate가 있다(`apps/mcp/src/tools/inferences.ts:84`).

## 8. 저장 시 응답 모델

오늘 실측: 최근 30일 198개 저장 중 **41개(21%)가 규약 위반**이고, 그중 **34개가 `past`라
고칠 수 없다.** 결론은 "거부를 늘리자"가 아니다.

> **21% 문제는 "저장 성공 후 조용히 정상 취급"이 문제이지 원문을 버려야 한다는 의미가 아니다.**

응답은 `saved` / `saved_with_repairs` / `rejected` 셋.

| | 무엇 | 조건 |
|---|---|---|
| **자동 수선** | `event_id` 누락, schema version, tags 정규화, 금지 폴더→fallback, 제목 정규화 | 해답 유일 + payload 불변 + 되돌릴 수 있음 + 다른 기억을 안 숨김 (4조건 전부) |
| **저장 후 격리** | 태그 없음→`needs_tags`, 깨진 링크→`unresolved_link`, predecessor 불명→관계 없이 저장, register 검증 실패→timeline downgrade | 정답은 의미 판단에 달렸지만 저장 자체는 안전 |
| **거부** | agent의 rule 쓰기, past 의미 수정, `event_id` 위조, 파괴적 update, 외부 파일 수정 | 권한·불변성·식별자 충돌만 |

`RULE_USER_ONLY`(`note.ts:161`)와 `EXTERNAL_SOURCE`(`note.ts:454`)가 이미 셋째 범주다.
**깨진 링크·태그 없음·금지 폴더는 거부 사유가 아니다.**

### past 불변의 경계를 다시 긋는다

지금 `editNote`는 patch 내용을 보기 전에 `past` 전체를 거부한다(`note.ts:443`). 이를 둘로 가른다.

```
semantic edit    title/body 의미 변경                        past면 거부
catalog patch    event_id · tags · aliases · schema version   past에도 허용
                 · typed relation · scope · 파일 이동
```

**검증은 해시로 한다**: 수정 전 `bodyHash` → frontmatter만 변경 → 수정 후 `bodyHash` →
**다르면 전체 거부.** allowlist + 해시 동일성이라 자연어 의미 판정이 필요 없다.

`layer`는 세션 주입·권한에 영향을 주므로 일반 catalog patch가 아니라 **사용자 전용
reclassification**으로 분리한다. 그리고 `renderNoteFile`이 사실상 `title`만 갱신하므로
(`note.ts:82`) 범용 frontmatter patch 경로가 따로 필요하다.

**`event_id`는 일괄 backfill하지 않는다.** 신규 노트는 생성 시 부여 → 기존 노트는 typed
relation 대상이 될 때만 → 전체 backfill은 모델 검증 후 선택적으로 → 외부 index source는
수정하지 않는다.

## 9. 검증 계획 — 잴 수 있는 것과 출시해야 아는 것

이 문서에서 가장 정직해야 할 절이다.

### 출시 전 측정 가능

- register fold 정확성, tip 정확도
- predecessor / identity recall
- 지연 wiki-link · co-citation recall@budget
- nomination lead time (실제 선언보다 며칠 먼저 지명했나)
- latency · 메모리, full scan 제거 여부

### 출시해야 아는 것

**유용성, 놀라움, 수용률, inference 재사용률, 수용된 영감당 검토 시간.**

### 회고 검증의 한계

사용자가 나중에 스스로 선언한 연결을 정답으로 놓고, **그 연결이 선언되기 전 시점의
코퍼스에서** nominator가 지명할 수 있었는지 본다. 유효한 사전 smoke test지만 —

> **positive-unlabeled benchmark다. 알려진 positive의 recall은 잴 수 있지만 precision은
> 계산하면 안 된다.** 나머지 후보가 오탐인지 미발견 영감인지 알 수 없으므로.

표본이 층마다 다르다(오늘 DB 실측):

| 층 | 표본 | 쓸 수 있나 |
|---|---|---|
| Identity / predecessor | `amends` 74쌍 | ✅ 회귀 테스트 |
| Semantic-neighborhood | 지연 wiki 엣지 80쌍 (90일+ 6) | ✅ 거친 nominator 비교 |
| **Hypothesis bridge** | co-citation 30일+ 지연 **14건** · inference **9개** | ❌ 통계적 최적화 불가 |

**즉 회고 검증으로 나쁜 설계를 기각할 수는 있지만 목표 3의 가치를 입증할 수는 없다.**

이건 `2026-08-26-discovery-supply.md`가 세운 "만들기 전에 재라"가 **원리적으로 적용되지 않는
유일한 축**이다. error detection에는 ground truth가 있었다 — #1975가 트라이얼 60일이라 했고
#2119가 14일로 바꿨다는 건 원문을 읽고 확인할 수 있다. **영감에는 없다.**

시간 재생 시 미래의 link·alias·feedback·inference를 전부 숨겨야 하고, `tidy`가 frontmatter를
실제로 재작성하므로(`apps/cli/src/services/tidy.ts:117`) git history 없이 현재 태그를 과거
replay에 쓰면 누수가 생긴다.

### 그래서 — 실패해도 싼 최소 출시

**정본에 아무것도 쓰지 않는 inline pilot.**

원문 excerpt 두 개 + 한 문장 bridge 가설 → `유용함 / 아님 / 나중에`만 수집 → 승인 전에는
관계·노트·register 생성 없음 → 승인 시에만 provenance 있는 inference로 저장 → arm·반응·검토
시간 기록. **10건 연속 명시적 기각이면 해당 arm 자동 중단**(초기 안전장치).

## 10. 기존 문서와의 관계

**`2026-08-21-state-as-projection.md`** — `past` 불변, state/inference 분리, "frontmatter 정본
/ DB 파생"은 유지한다. 바뀌는 것 둘: state의 **저장 형태**(mutable 문서 → immutable snapshot의
tip)와 stale 탐색의 **방향**(state→evidence → 신규 event→영향받는 state). 핵심 철학
("사람이 내린 판단과 기계가 뽑은 가설을 한 층으로 합치지 않는다")은 그대로다.

**`2026-08-26-discovery-supply.md`** — "월 3~4건"의 범위를 **stale/conflict 위생 공급량으로
한정**한다. Connection Engine 전체로 일반화하면 안 된다. 그 숫자는 코퍼스의 발견 총량이 아니라
**당시 nominator의 수확량**이었다. 다만 "매번 LLM으로 투영하지 않는다"는 원칙은 유지한다.

**`2026-08-22-conflict-detection.md`** — rule 전수 비교(55쌍)는 오늘 실측에서 모순 0건이었다
(1건은 오탐). rule 규모가 커지면 same key/scope·공유 anchor로 blocking한다.

## 11. 실행 순서

앞의 여섯이 전부 규모 대응 리팩터다. register는 일곱째, pilot 출시는 열한째다.

| # | 무엇 | 위치 | 상태 |
|---|---|---|---|
| 1 | 정본/파생 경계 확정, 위생·영감 파이프라인 분리 | — | |
| 2 | 쓰기마다 동기 `refreshSignals` 제거 → change log + detector별 watermark | `core/src/note.ts:217,516` | ✅ `ccde7a4` |
| 3 | `resolveLinkTargets` title 전수 적재 → 정규화 인덱스 point lookup | `db/src/link-index.ts` | ✅ `27658f4` |
| 4 | 본문 전체 적재 → `link_targets` 추출 테이블 + LEFT JOIN | `db/src/link-index.ts` | ✅ `ba3ede9` |
| 5 | 오타 후보 title 전수 편집거리 → prefix/trigram 축소 후 소수만 | `db/src/dangling.ts` | ✅ `ecd4e09` |
| 6 | startup migration 본문 전체 스캔 → versioned batch cursor | `db/src/migrations.ts` | ✅ `46996fc` |
| 7 | predicate registry + register 도입 | 신규 | ⚠️ 성격 변경 |
| 8 | `stale_state` 방향 역전 (신규 event → 영향받는 state) | `db/src/signals.ts` | ✅ `b76bef9` |
| 9 | `hidden_arc` 전체 재구축 → 신규 노트 kNN만 증분 | `db/src/signals.ts` | ✅ `b76bef9` |
| 10 | 회고 benchmark 실행 (74 / 80 / 14건) | — | |
| 11 | inline pilot 출시 (structural 60 / live 30 / exploration 10) | — | |
| 12 | 명시적 피드백 100건 후 예산 재배분 | — | |

> **7번의 성격이 바뀌었다** — `2026-08-28-what-memex-is.md`. register는 부차적 기능이 아니라
> "AI가 히스토리와 현재 상태를 파악한다"는 목표 그 자체이고, 데스크탑 앱이 보여주고
> 교정하는 대상이다. **스키마만이 아니라 화면과 함께 설계한다.**

10만 개 × 3KB면 지금은 탐지 1회에 **약 300MB를 메모리에 올린다.** 2~6번을 안 하면 register도
nomination도 의미가 없다.

### 2~6이 실제로 걷어낸 것 (2026-08-28)

1,387개 볼트 실측. 전부 동작 보존 — 링크 해석 569건 불일치 0, dead link 88노트 불일치 0,
dangling 분류는 바이트 동일.

| 무엇 | 전 | 후 |
|---|---|---|
| 링크 1건 해석 ×1,000 | 2,011ms | 7ms |
| dead link 전수 판정 | 본문 전량 적재 | 인덱스 조인 |
| dangling 분류 1회 | 213ms | 13ms |
| **저장 1회** | **363ms** | **5ms** |
| 변화 없는 read refresh | 366ms | 0ms |
| 태그만 바뀐 뒤 refresh | 366ms | 3ms |

읽기 경로의 전수 sweep은 2번 시점에 365ms로 남아 있었다. 8·9번이 그걸 마저 걷어냈다.

### 8·9가 걷어낸 것 (2026-08-28)

두 detector 모두 비용이 **노트당 벡터 쿼리 1회**였다. `stale_state`는 state 247개를
순회했고, `hidden_arc`는 매번 mutual-kNN 그래프를 1,387개에서 다시 만들었다.

- **8번** — 질문 방향을 뒤집었다. 신규 past 노트는 자기 근처의 state만 흔들 수 있으니,
  모든 state에서 안쪽으로 묻지 않고 움직인 노트에서 바깥으로 찾는다. 삭제는 임베딩이
  남지 않으므로 **이미 그 노트를 인용하던 신호에서** 대상 state를 복원한다.
- **9번** — 그래프를 저장한다(`note_neighbors`). 비싼 건 union-find나 필터가 아니라
  **같은 엣지를 매번 다시 만드는 것**이었다. 이웃이 움직일 수 있는 노트만 재조회한다:
  바뀐 노트, 그걸 가리키던 노트, 같은 반경 안에 새로 들어온 노트. 그보다 먼 건 mutual
  엣지가 될 수 없으니 arc에도 못 낀다. **출력은 여전히 전수다.**
- **회수(retire)도 같은 경계를 배웠다.** 전수 sweep은 자기 신호를 void라 말할 수 있지만,
  몇 개 노트에서 출발한 detector는 **닿은 identity에 대해서만** 말할 수 있다. 그 너머를
  회수하면 아무도 다시 안 본 발견이 지워진다. 이제 detector가 "무엇을 판정했는지"를 같이 낸다.

**검증** — 실볼트에서 추가·수정·삭제·개명·복합 변경 12라운드 무작위, **증분 == 전수 12/12**.
합계 397ms 대 4,886ms.

| | 2번 직후 | 8·9번 이후 |
|---|---|---|
| 읽기 refresh (변화 없음) | 0ms | 0ms |
| 읽기 refresh (변화 있음) | 365ms | 12~100ms |
| **저장 1건** | **5ms** (힌트 dangling만) | **20ms** (힌트 네 종류 전부) |
| 저장 직후 read | 365ms | **0ms** |

**저장이 다시 full refresh다.** 2번 시점엔 감당할 수 없어서 우회했는데, 이제 detector가
방금 기록된 변화에서 출발하므로 **쓰기가 자기 변화분만 내고 뒤따르는 read는 할 일이 없다.**
힌트도 온전해졌다 — 1,390개 중 225개(dangling_link 64 / stale_state 146 / hidden_arc 15).

남은 전수 스캔 하나: `apps/cli/src/services/indexer.ts`의 `resyncLinks`가 아직 본문을 전량
읽는다. 인덱싱 자체가 O(N)이라 급하진 않지만 `note_link_targets`에서 읽으면 없앨 수 있다.

## 12. 논의 메모 — 무엇이 철회됐나

4라운드 논의에서 양쪽이 각각 넷씩 철회했다. 남은 것이 견고한 이유가 그것이다.

**Claude가 철회한 것**
- "UI가 37개 노트에 거짓말한다, 88% 오탐" → 실측 57%
- "같은 날 `amends`는 후속 기록이다" → 표본 9쌍 중 6쌍이 진짜 정정. **이 볼트의 시간 단위는
  세션이다**
- "`C(n,2)`가 크니 미발견 가치도 많다" → 0.35→0.45에서 63→537 폭증이 반증. 문제는 threshold가
  아니라 nominator 다양성
- "predicate를 첫 등장 노트의 `event_id`로 정의하자" → 어휘 생명주기가 사건에 종속됨

**Codex가 철회한 것**
- "후속 스냅샷은 현재 상태를 완전히 표현해야 한다" → 기계가 검사 못 하고, 비용이 누적되고,
  에이전트가 저장을 포기한다
- "명시적 chain은 E5보다 정확하다" → **측정되지 않은 추측임을 인정.** 대신 분류 정확도가
  아니라 **동작의 인과성**으로 해결 (`update_note(id)`는 호출자가 관계를 선언한다)
- "activity 기반 nomination 70%" → `retrieval_log` 97.6% 오염 실측 후 **0%로 시작**
- "`scope`를 자유 문자열로" → `global | period` 둘만, 기계 검증 가능한 경계로

가장 크게 남은 것은 지표의 재정의다. **진짜 제한 자원은 저장 공간이 아니라 사용자의 검토
시간이다.** 이 문장이 없으면 세 목표가 전부 "많이 보여주기"로 붕괴한다.
