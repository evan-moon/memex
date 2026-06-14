# memex rule 노트 (설치용)

rule 레이어는 MCP에서 쓰기가 막혀 있어(user-only) CLI로만 설치합니다. `memex add`는 `actor:'user'`라 허용됩니다. 설치하면 MCP 부팅 시 House Rules로 자동 주입됩니다.

```bash
memex add --layer rule --title "노트 캡처 포맷 규칙" --file docs/rules/capture-format.rule.md
memex add --layer rule --title "memex 검색 규칙 (에이전트)" --file docs/rules/agentic-query.rule.md
```

- `capture-format.rule.md` — Lever 4·5 실현: 제목 컨벤션 + TL;DR 첫 문단 + 노트 atomicity + 엔티티 일관 명명. 코드 0, 새 노트부터 즉시 검색 품질 개선.
- `agentic-query.rule.md` — Lever 6 실현: 멀티쿼리(한/영·워딩/개념) + 날짜/태그 필터 + 사전추론. 재인덱싱 불필요.

> 주입 예산: `MEMEX_RULES_MAX_CHARS`(기본 8000) 안에서 다른 rule 노트와 합산되니, 너무 길게 늘리지 말 것.
