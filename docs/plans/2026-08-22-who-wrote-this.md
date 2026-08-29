# 누가 썼고, 누가 소유하나

> [[모순 탐지 — 낡음 다음에 오는 것]]이 증상을 셌다. 이 문서는 원인을 다룬다.
> 볼트 안에 저자가 둘이고, 볼트 밖 파일을 memex가 고칠 수 있었다.

## 모순 탐지가 알려준 것

판정한 20쌍 중 발견 3건이 **전부 같은 모양**이었다.

```
1390 person  projects/firma/Firma 프로젝트 현황
2082 agent   projects/agent-team/memory/project_firma.md        ← 모순
1579 person  investing/할랄 렌즈 프로젝트 시작
2084 agent   .../memory/project_halal_lens.md                   ← 중복
1762 person  projects/opula/opula 블로그 보이스
2076 agent   .../memory/feedback_opula_blog_voice.md            ← 중복
```

사람끼리 쓴 12쌍에서는 0건. **모순은 한 머릿속이 변해서가 아니라 같은 것을 두 손이 따로 적고
서로 안 읽어서 생긴다.**

규모를 쟀다. 에이전트 노트 **135개가 전부 `*/memory/` 디렉토리**에 있다. 예외 0건.

```
projects/opula/memory       69
projects/agent-team/memory  28
projects/firma/memory       27
그 외                       11
```

## 문제 1 — 에이전트가 자기 글을 남의 글로 읽는다

`author` 축은 2026-08-21에 생겼다. UI는 이미 배지를 단다(`bits.tsx`의 `Agent`). 그런데
**MCP는 저자를 아예 안 내려보냈다.**

```
1. #2082 [state] project_firma        ← 사람이 쓴 판단과 구별 불가
```

`get_note`도 `source`만 보여주고 `layer`도 `author`도 없었다. 즉 Claude가 검색하면 자기가
지난 세션에 쓴 요약이 사용자의 말과 똑같은 모양으로 돌아온다. inference를 검색에서 뺀 이유가
model collapse인데, **같은 경로가 agent state 135개로 열려 있었다.**

고친 것:

```
1. #2082 [state · agent] project_firma
...
⚠️ Results marked `agent` are notes an agent wrote in an earlier session, not the
user's own words. ... When one disagrees with a note the user wrote, the user's note wins.
```

표식만으로는 부족하고 **무엇을 하라는지**가 있어야 한다. 그래서 우선순위를 문장으로 박았다.

랭킹 감점은 하지 않았다. 검색 품질은 `memex stats eval`로 재는 것이 이 리포의 방식이고,
재지 않고 순위를 흔드는 것은 규칙 위반이다. 감점이 필요하다면 먼저 측정한다.

## 문제 2 — 빌린 파일을 고치고 지울 수 있었다

볼트 밖 파일 265개가 인덱싱돼 있다(evan-blog 256, memex 리포 9). 이것들은 git이 소유한다.

- **편집**: 다음 `memex index`가 파일을 다시 읽어 덮어쓴다. 즉 성공한 것처럼 보이는 편집이
  조용히 사라진다. 가장 나쁜 실패다.
- **삭제**: `removeNote`가 조건 없이 `unlinkSync(filePath)`를 했다. **`memex delete 434`는
  실제 블로그 README를 지웠다.** 비가역 데이터 유실이다.

판별에 config는 필요 없었다. **볼트 밖이면 빌린 것이다.**

```
#434 was indexed from /Users/evan/dev/playground/evan-blog, outside the vault.
Deleting it here would delete the original file. Remove the directory with
`memex source` instead, or delete the file where it lives.
```

편집은 거절하되 대안을 준다. `PAST_IMMUTABLE`이 정정 노트를 제안하듯, `EXTERNAL_SOURCE`는
**그 글에 대한 자기 노트**를 제안하고 빌린 노트를 `derives_from`으로 걸어준다. 막는 것이
아니라 옮기는 것이고, 부수효과로 근거 선언이 는다.

## 계층

| | 쓰기 | 검색 | 규모 |
|---|---|---|---|
| 사람이 쓴 것 | 가능 | 1급 | 1,229 |
| 에이전트가 쓴 것 | 가능 (검열 대상) | 표식 붙여 노출 | 135 |
| 빌린 것 | **불가** | 근거로만 | 265 |

볼트를 쪼개지 않았다. 쓰기 가능한 볼트는 여전히 하나다. 나뉜 것은 볼트가 아니라 **소유권**이고,
그건 파일 경로가 이미 알고 있었다.

## 하지 않은 것

- **`*/memory/` 인덱싱 제외** — 에이전트 메모리는 진짜 기억이다. 안 보이게 하는 게 아니라
  누가 썼는지 말하게 하는 게 맞다.
- **랭킹 감점** — 측정 없이 순위를 바꾸지 않는다.
- **`sources[].mode` 설정** — 볼트 밖이라는 사실로 충분하다. 설정이 하나 늘면 틀리게 설정할
  방법도 하나 는다.

## 다음

- 중복 135개를 쌍으로 푸는 대신, 에이전트 메모리와 사람 노트를 **한쪽으로 합치는 규칙**이
  있어야 하는가? (예: 에이전트 메모리는 항상 사람 노트를 `derives_from`으로 가리킨다)
- `stats audit`에 저자 축 한 줄 추가
