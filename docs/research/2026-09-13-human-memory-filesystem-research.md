# 인간의 기억을 파일시스템 위에서 재구성하기

## 연구 질문

사람이 남긴 문서, 메모, 대화와 활동 기록을 파일시스템에 보존하면서도, 필요한 순간에는 인간의 기억처럼 맥락을 따라 되찾고 현재 작업에 맞게 재구성할 수 있는가? 기존 연구가 memex의 제품 설계에 주는 답은 다음과 같다.

**원본은 파일로 보존하되, 기억의 구조를 폴더 트리 하나에 고정하면 안 된다.** 사람은 정확한 파일명이나 저장 위치보다 시간, 사람, 당시 하던 일, 출처, 시각적 위치 같은 단서를 부분적으로 기억한다. 회상은 저장된 항목 하나를 그대로 읽는 과정이라기보다, 현재 목표가 여러 단서를 활성화하여 관련 사건과 사실을 다시 구성하는 과정이다. 따라서 제품은 안정적인 원본 위에 여러 동적 관점, 시간 관계, 출처가 있는 요약과 작업별 경로를 만들어야 한다.

## 1. 기억은 저장보다 단서에 의존한다

Tulving과 Thomson의 encoding specificity 원리는 효과적인 회상 단서가 정보 자체의 일반적 의미만으로 결정되지 않고, 그 정보가 처음 부호화될 때의 조건과 관계에 의존한다고 설명한다.^1 Conway와 Pleydell-Pearce의 Self-Memory System은 자전적 기억을 고정된 레코드의 재생이 아니라, 현재 목표가 자전적 지식 기반을 탐색하여 만드는 일시적 구성으로 본다.^2

이 관점에서 “어떤 문서가 의미상 비슷한가?”만 묻는 벡터 검색은 인간의 회상을 충분히 지원하지 못한다. 사용자는 다음처럼 불완전하지만 개인적인 단서를 기억한다.

- 그때 누구와 이야기했는지
- 어느 프로젝트를 하던 중이었는지
- 대략 언제였는지
- 그 결정을 내리기 전에 무엇을 읽었는지
- 결과보다 어떤 이유나 갈등이 있었는지
- 이메일, 회의, 문서 중 어디에서 본 것 같은지

개인 단서는 일반 단어보다 자전적 기억을 더 직접적이고 빠르게 불러올 수 있다는 실험 결과도 있다.^3 개인 정보 검색에서 이 단서를 수집하고 조합하는 것은 부가 메타데이터 작업이 아니라 검색의 핵심이다.

Risko와 Gilbert가 정리한 cognitive offloading 연구는 파일과 노트가 단순 저장소가 아니라 인지 작업을 외부로 옮기는 장치임을 보여준다.^4 다만 외부화는 나중에 다시 접근할 수 있다는 믿음과 적절한 단서가 함께 있을 때 유용하다. 저장 비용만 낮추면 기록량은 늘지만 회수 비용도 함께 늘 수 있다.

### memex에 주는 원칙

1. 입력할 때 분류를 강요하지 말고, 시간·활성 문서·프로젝트·대화·참조 자료 같은 부호화 맥락을 자동 보존한다.
2. 검색창은 키워드뿐 아니라 “언제, 누구와, 무슨 일을 하다가, 무엇이 바뀌었나”를 받을 수 있어야 한다.
3. 검색 결과는 유사도순 파일 목록보다 사용자의 현재 작업과 연결되는 이유를 보여줘야 한다.
4. AI가 만든 재구성은 원본과 분리하고, 각 문장이나 결론이 어떤 기록에서 왔는지 추적할 수 있어야 한다.

## 2. 사람은 검색만 하지 않고 방향을 잡아가며 찾는다

개인 정보 관리 연구에서는 사용자가 폴더 탐색을 계속 선호한다는 결과가 반복된다. Barreau와 Nardi는 파일의 위치가 찾기뿐 아니라 해야 할 일을 상기시키는 역할도 한다고 보았다.^5 Jones 등의 후속 연구에서는 파일은 주로 폴더 탐색으로, 이메일은 검색으로, 웹 정보는 자동완성 검색과 링크 탐색을 섞어 되찾았다. 연구진은 검색과 탐색을 통합해야 한다고 결론 내렸다.^6

Teevan 등의 연구는 이를 orienteering이라고 부른다. 사람은 한 번의 완벽한 질의로 목적지에 도달하기보다, 알고 있는 출처나 사람, 폴더, 날짜에서 출발해 작은 단계를 밟으며 범위를 좁힌다.^7 정확한 답을 내는 검색 엔진만으로는 이 과정에서 얻는 확신, 맥락, 중간 발견을 대신할 수 없다.

Stuff I've Seen은 이메일, 웹페이지, 문서, 일정 등 사용자가 본 자료를 통합 색인하고 시간과 사람을 주요 단서로 제공했다. 230명 이상이 참여한 배포 평가에서 시간과 사람이 중요한 회수 단서였고, 설치 뒤 다른 검색 도구 사용이 줄었다.^8 현재 활동 상태를 반영한 데스크톱 검색 연구도 같은 키워드가 현재 하던 일에 따라 다른 의미를 갖는다고 보고, 활동 맥락을 랭킹에 넣었을 때 검색 경험이 개선됐다고 밝혔다.^9

### memex에 주는 원칙

- 폴더는 없앨 대상이 아니다. 사용자가 기억하는 안정적인 장소이자 상기 장치다.
- 폴더는 유일한 분류 체계가 아니다. 시간, 사람, 프로젝트, 문서 종류, 기억 상태를 같은 원본 위의 다른 관점으로 제공한다.
- 결과 화면은 “정답 10개”보다 출발점, 좁히기, 인접 기록, 이전·이후 맥락을 제공해야 한다.
- 현재 열어둔 문서와 최근 작업을 질의의 묵시적 맥락으로 사용하되, 적용된 맥락을 사용자가 볼 수 있어야 한다.

## 3. 파일시스템을 의미 구조로 확장하려는 계보

Bush가 1945년에 제안한 memex의 중심은 저장 용량이 아니라 associative trail이었다. 항목을 서로 연결하고, 그 경로에 이름을 붙이며, 다시 따라가고 다른 사람에게 전달할 수 있는 구조였다.^10 오늘날의 백링크는 항목 간 연결을 구현했지만, 특정 문제를 풀기 위해 밟았던 경로 자체를 보존하고 재사용하는 부분은 여전히 약하다.

Semantic File System은 기존 트리 구조를 유지하면서 파일에서 저자, 제목, 내용, 타입 같은 속성을 자동 추출하고, 질의를 virtual directory로 표현했다.^11 Placeless Documents는 문서의 물리적 장소보다 사용자와 작업에 의미 있는 속성으로 문서 공간을 구성하고, 같은 문서를 여러 사람과 작업의 관점에서 다르게 조직할 수 있게 했다.^12

Lifestreams는 데스크톱과 폴더 대신 모든 문서를 시간순 스트림으로 놓고, 필터로 동적 하위 스트림을 만들며 요약하는 방식을 제안했다.^13 Haystack은 서로 다른 출처의 정보를 공통 의미 모델로 모으고, 같은 데이터도 현재 작업에 맞는 화면과 컬렉션으로 조합하려 했다.^14

이 계보가 공통으로 보여주는 것은 “더 나은 영구 분류법”의 실패다. 파일은 한 위치에 있어도 여러 의미를 가진다. 의미는 시간이 지나며 바뀌고, 사용자의 현재 작업에 따라서도 달라진다. 필요한 것은 원본의 안정성과 관점의 유동성을 분리하는 구조다.

### memex에 적합한 구조

```text
원본 계층
  Markdown 파일 · 첨부 · 대화 · 변경 이력
            ↓ 추출하되 원본을 대체하지 않음
단서 계층
  시간 · 사람 · 프로젝트 · 출처 · 활성 작업 · 링크 · 접근 이력
            ↓ 관계와 변화를 보존
기억 계층
  사건 · 현재 상태 · 결정 · 이유 · 반대 근거 · 미결 질문
            ↓ 현재 작업에 맞춰 선택
재구성 계층
  이어가기 · 타임라인 · 관련 자료 · 결정의 변화 · 글감 묶음
```

폴더는 원본 계층에 남는다. 단서·기억·재구성 계층은 파생 구조이며 언제든 다시 만들 수 있어야 한다. AI 요약을 파일의 진실로 덮어쓰지 않고, 원본 revision과 생성 시점을 가리키게 하는 이유가 여기에 있다.

## 4. 전체 캡처는 기억을 만들지 못한다

MyLifeBits는 문서, 이메일, 사진, 웹페이지뿐 아니라 통화, 회의, 화면 활동까지 평생 저장하는 실험을 수행했다.^15 이 연구는 대규모 개인 기록의 가능성을 보여줬지만, 후속 논의는 방대한 원시 데이터가 상위 개념과 회수 구조 없이 사실상 사용할 수 없고, 장기 포맷·사생활·공동 소유권 문제가 남는다고 지적했다.^16

Sellen과 Whittaker는 lifelogging의 “모든 것을 캡처하면 나중에 유용할 것”이라는 전제를 비판하며, 인간 기억을 돕는 구체적인 기능과 사용 목적에서 설계를 시작해야 한다고 주장했다.^17 회의 기록 재사용을 관찰한 연구에서도 사람은 자료를 다시 들으며 유용한 조각을 고르고, 관계를 만들고, 새 산출물로 재작성했다. 연구진은 수집 시점에 완전한 조직화를 요구하지 않는 staging area가 필요하다고 결론 내렸다.^18

따라서 memex가 수집량을 성공 지표로 삼으면 잘못된 방향으로 갈 가능성이 크다. 좋은 기억 시스템은 모든 것을 보여주는 시스템이 아니라, 현재 작업에 필요한 적은 증거를 선택하고 빠진 부분과 불확실성을 드러내는 시스템이다.

## 5. 최근 AI 기억 연구가 더한 것

Generative Agents는 관찰의 전체 스트림을 보존하면서 중요도·최신성·관련성으로 기억을 검색하고, 여러 기록을 상위 reflection으로 합성했다. 구성 요소 제거 실험에서 관찰, 계획, reflection이 모두 행동의 일관성에 기여했다.^19 MemGPT는 제한된 컨텍스트와 외부 저장소 사이의 이동을 운영체제의 계층형 메모리에 비유했다.^20 두 연구 모두 저장소 전체를 매번 모델에 넣는 방식 대신, 계층과 선택이 필요하다는 점을 보여준다.

LongMemEval은 장기 대화 기억을 단순 사실 검색이 아니라 정보 추출, 여러 세션에 걸친 추론, 시간 추론, 지식 갱신, 답을 보류하는 능력으로 나눈다.^21 2025년의 timeline-based memory 연구는 오래된 기억을 삭제하기보다 시간과 인과 관계로 연결하면 변화 과정이 유용한 맥락이 된다고 주장한다.^22 최근 계층형 검색 연구도 벡터 유사도만으로 많은 조각을 가져오면 정밀도와 검토 가능성이 떨어지며, 먼저 사건 요약을 고른 뒤 필요한 원문 턴만 읽는 방식이 더 적은 증거로 나은 결과를 냈다고 보고한다.^23

이 결과들은 memex가 이미 고민해온 `past`, `state`, `rule`, 정정과 출처 구조를 지지한다. 다만 고정된 레이어만으로 충분하지 않다. 같은 기록을 질문에 따라 사건, 현재 상태, 결정의 변화, 글쓰기 재료로 다르게 조립할 수 있어야 한다.

## 6. 제품 가설

연구를 종합하면 memex의 차별화 지점은 “AI가 붙은 Obsidian”이나 “개인 문서용 검색창”보다 다음 정의에 가깝다.

> **memex는 파일로 남긴 삶과 작업의 기록을 보존하고, 지금 하는 일에 필요한 기억의 경로를 근거와 함께 재구성하는 개인 작업 공간이다.**

여기서 파일시스템은 소유권·호환성·영속성을 담당한다. 기억 시스템은 파일 위에서 시간과 관계를 복원한다. AI는 최종 진실을 쓰는 주체가 아니라, 현재 질문에 맞는 경로를 만들고 근거를 설명하는 역할을 맡는다.

### 가장 먼저 검증할 경험

**이어가기**를 첫 번째 완결 기능으로 둔다.

사용자가 프로젝트나 문서를 열고 “어디까지 했지?”라고 물으면 memex가 다음 묶음을 만든다.

1. 마지막으로 실제 작업한 기록
2. 현재 유효한 결정과 그 이유
3. 이후 변경되거나 충돌한 내용
4. 아직 닫히지 않은 질문
5. 다음 행동과 관련 원문

각 항목은 원문 구절과 revision으로 이동할 수 있어야 한다. 사용자가 항목을 빼거나 다른 기록을 추가하면 그 선택도 이번 작업의 trail로 남긴다. 다음 재진입에서는 같은 trail을 출발점으로 삼되, 이후 생긴 변경을 덧붙인다.

글쓰기에서는 같은 엔진이 “이 주장과 연결되는 예전 생각, 사례, 반대 근거”를 묶는다. 프로젝트에서는 “결정, 이유, 변경, 미결 사항”을 묶는다. 저장 구조는 같고 재구성 렌즈만 다르다.

### 검색 평가를 바꾸는 질문

일반적인 precision@k만으로는 제품 가치를 측정하기 어렵다. 다음 과업을 실제 개인 볼트에서 평가해야 한다.

- 정확한 단어를 모르는 상태에서 필요한 원문에 도달하는가
- 서로 다른 시점의 기록을 현재 상태와 변화 과정으로 구별하는가
- 재구성된 결론마다 근거를 확인할 수 있는가
- 관련 기록이 없거나 충돌할 때 답을 보류하는가
- 찾아온 맥락이 실제 문서 수정, 결정, 다음 행동으로 이어지는가
- 같은 작업을 다시 열었을 때 탐색 비용이 줄어드는가

첫 지표는 “검색 성공률”보다 **과거 기록을 활용해 작업을 이어간 횟수와, 이어가기까지 걸린 시간**이 적합하다. 잘못된 현재 상태를 제시한 횟수와 근거 없는 합성도 반드시 함께 세야 한다.

## 7. 구현 우선순위에 대한 결론

1. **기록 마찰 제거:** 데일리 노트, 빠른 입력, 붙여넣기, 첨부, 안정적인 자동 저장과 재진입. Obsidian을 완전히 복제하기보다 실제 이탈을 만드는 기본 동작을 해결한다.
2. **부호화 맥락 보존:** 생성·열람·수정 시각, 활성 프로젝트와 문서, 연결 자료, 대화 세션을 자동으로 남긴다.
3. **하이브리드 회수:** 전문·벡터·시간·사람·폴더·링크·현재 작업 신호를 결합한다. 사용자가 결과를 단계적으로 좁힐 수 있게 한다.
4. **시간적 재구성:** 원본을 보존하면서 결정과 상태의 변화, 정정, 근거 관계를 타임라인으로 만든다.
5. **trail의 1급 객체화:** 한 작업에서 선택하고 사용한 자료, 생성된 요약, 최종 산출물을 함께 저장하여 다음 작업의 시작점으로 만든다.
6. **회수 피드백:** “유용함” 버튼보다 실제로 열기, 인용, 참고에 추가, 결과물에 사용, 제외한 기록을 학습 신호로 삼는다.

## 8. 연구의 한계

고전 PIM 연구의 상당수는 이메일과 데스크톱 파일 중심이며, 참여자 수가 작거나 2000년대 업무 환경을 반영한다. 인간 기억의 실험실 연구를 곧바로 UI 설계 규칙으로 옮길 수도 없다. 최근 AI 기억 연구는 합성 대화와 자동 평가에 많이 의존하고, 개인의 실제 장기 기록을 기반으로 한 제품 사용성까지 입증하지 않는다.

따라서 이 문서의 제품 제안은 연구에서 직접 증명된 결론이 아니라, 여러 연구 결과를 memex의 맥락에 적용한 해석이다. 실제 Evan의 볼트에서 프로젝트 이어가기와 글쓰기 과업을 반복 관찰해 반증해야 한다.

## 읽을 순서

1. Elsweiler et al. — 기억 실패 관점에서 PIM을 설계하는 가장 직접적인 연구
2. Teevan et al. — 완벽한 검색만으로 부족한 이유
3. Dumais et al. — 통합 개인 검색과 시간·사람 단서의 실증
4. Sellen & Whittaker — 전체 캡처가 왜 답이 아닌지
5. Bush — associative trail이라는 원래 memex의 제품 개념
6. LongMemEval과 timeline-based memory — AI가 시간·갱신·보류를 다뤄야 하는 이유

## Sources

1. Endel Tulving and Donald M. Thomson. “[Encoding Specificity and Retrieval Processes in Episodic Memory](https://doi.org/10.1037/h0020071).” *Psychological Review* 80(5), 1973.
2. Martin A. Conway and Christopher W. Pleydell-Pearce. “[The Construction of Autobiographical Memories in the Self-Memory System](https://doi.org/10.1037/0033-295X.107.2.261).” *Psychological Review* 107(2), 2000.
3. Tugba Uzer and Norman R. Brown. “[The Effect of Cue Content on Retrieval from Autobiographical Memory](https://doi.org/10.1016/j.actpsy.2016.11.012).” *Acta Psychologica* 172, 2017.
4. Evan F. Risko and Sam J. Gilbert. “[Cognitive Offloading](https://discovery.ucl.ac.uk/id/eprint/1508770/).” *Trends in Cognitive Sciences* 20(9), 2016.
5. Deborah Barreau and Bonnie A. Nardi. “[Finding and Reminding: File Organization from the Desktop](https://doi.org/10.1145/221296.221307).” *SIGCHI Bulletin* 27(3), 1995.
6. William Jones, Abe Wenning, and Harry Bruce. “[How Do People Re-find Files, Emails and Web Pages?](https://hdl.handle.net/2142/47300).” *iConference*, 2014.
7. Jaime Teevan, Christine Alvarado, Mark S. Ackerman, and David R. Karger. “[The Perfect Search Engine Is Not Enough](https://people.csail.mit.edu/teevan/work/publications/papers/chi04.pdf).” *CHI*, 2004.
8. Susan Dumais et al. “[Stuff I've Seen: A System for Personal Information Retrieval and Re-Use](https://www.microsoft.com/en-us/research/publication/stuff-ive-seen-a-system-for-personal-information-retrieval-and-re-use/).” *SIGIR*, 2003.
9. Jidong Chen et al. “[Context-aware Search for Personal Information Management Systems](https://www.microsoft.com/en-us/research/publication/context-aware-search-for-personal-information-management-systems/).” *SDM*, 2012.
10. Vannevar Bush. “[As We May Think](https://www.w3.org/History/1945/vbush/vbush7.shtml).” *The Atlantic Monthly*, 1945.
11. David K. Gifford et al. “[Semantic File Systems](https://pages.cs.wisc.edu/~remzi/Classes/838/Fall2001/Papers/sfs-sosp91.pdf).” *SOSP*, 1991.
12. Paul Dourish et al. “[Extending Document Management Systems with User-Specific Active Properties](https://doi.org/10.1145/348751.348758).” *TOIS* 18(2), 2000.
13. Eric Freeman and David Gelernter. “[Lifestreams: Organizing Your Electronic Life](https://doi.org/10.1145/381854.381893).” *AAAI Fall Symposium*, 1995.
14. Dennis Quan, David Huynh, and David R. Karger. “[Haystack: A Platform for Authoring End User Semantic Web Applications](https://haystack.csail.mit.edu/papers/iswc2003-haystack).” *ISWC*, 2003.
15. Jim Gemmell, Gordon Bell, and Roger Lueder. “[MyLifeBits: A Personal Database for Everything](https://www.microsoft.com/en-us/research/publication/mylifebits-a-personal-database-for-everything/).” *Communications of the ACM* 49, 2006.
16. Jim Gemmell and Gordon Bell. “[Challenges in Using Lifetime Personal Information Stores](https://www.microsoft.com/en-us/research/publication/challenges-in-using-lifetime-personal-information-stores/).” Microsoft Research.
17. Abigail Sellen and Steve Whittaker. “[Beyond Total Capture: A Constructive Critique of Lifelogging](https://www.microsoft.com/en-us/research/publication/beyond-total-capture-a-constructive-critique-of-lifelogging-2/).” *Communications of the ACM* 53(5), 2010.
18. Thomas P. Moran et al. “[I'll Get That Off the Audio: A Case Study of Salvaging Multimedia Meeting Records](https://chi1997.acm.org/proceedings/paper/tpm.html).” *CHI*, 1997.
19. Joon Sung Park et al. “[Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442).” *UIST*, 2023.
20. Charles Packer et al. “[MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560).” 2023.
21. Ziru Wu et al. “[LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory](https://arxiv.org/abs/2410.10813).” 2024.
22. Kai Tzu-iunn Ong et al. “[Towards Lifelong Dialogue Agents via Timeline-based Memory Management](https://aclanthology.org/2025.naacl-long.435/).” *NAACL*, 2025.
23. Shuqi Cao, Jingyi He, and Fei Tan. “[HiGMem: A Hierarchical and LLM-Guided Memory System for Long-Term Conversational Agents](https://aclanthology.org/2026.findings-acl.1690/).” *Findings of ACL*, 2026.
