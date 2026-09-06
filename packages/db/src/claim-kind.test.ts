import { describe, expect, it } from 'vitest';
import { classifyClaim } from './claim-kind.ts';

describe('classifyClaim', () => {
  // History does not become false, so there is nothing to ask about it.
  it('reads what happened as an event, however the past tense fuses', () => {
    expect(classifyClaim('firma-cloud 두뇌 재통합 v1을 완료·배포·검증했다.')).toBe('event');
    expect(classifyClaim('스크린샷 세 장을 재캡처해 코드 수정 결과를 반영했다.')).toBe('event');
    expect(classifyClaim('이슈 4는 의도된 동작으로 판단하여 손대지 않았다.')).toBe('event');
    expect(classifyClaim('이중계상되던 문제가 있었다.')).toBe('event');
  });

  it('reads what is true now as a state, which is the only thing the deck asks', () => {
    expect(classifyClaim('Opula의 채팅은 Groq에서 gpt-oss-120b를 돌린다.')).toBe('state');
    expect(classifyClaim('이번 회계 수정을 반영한 순자산은 약 7.38억원이다.')).toBe('state');
    expect(
      classifyClaim('firma는 오픈소스 로컬 엔진으로 남고 Opula는 닫힌 호스티드 제품이다.'),
    ).toBe('state');
  });

  // `있` ends on the same consonant the past tense does, so the plain present
  // must survive the test that catches 있었다.
  it('does not read 있다 as past', () => {
    expect(classifyClaim('파산이 최근 급증하고 있다.')).toBe('state');
    expect(classifyClaim('아직 해결되지 않은 문제가 있다.')).toBe('state');
  });

  // -아/어야 하다 fuses differently onto every verb stem, so the test is the
  // shape of the syllable before 야, not a list of verbs.
  it('reads an obligation as a rule however the verb fuses', () => {
    expect(classifyClaim('답하기 전에 먼저 search_notes로 검색해야 한다.')).toBe('rule');
    expect(classifyClaim('시장 클러스터 하단보다 낮게 잡아야 한다.')).toBe('rule');
    expect(classifyClaim('past 레이어의 노트는 불변이어야 한다.')).toBe('rule');
    expect(classifyClaim('월 3~5콜의 무료 맛보기를 둬야 한다.')).toBe('rule');
    expect(classifyClaim('opula-book은 투자교육서로 전면 재편되어야 한다.')).toBe('rule');
    expect(
      classifyClaim('도달률이 47%를 넘는지로 판단해야 하며, 밑돌면 킬 스위치가 적용된다.'),
    ).toBe('rule');
  });

  it('reads a prohibition as a rule', () => {
    expect(classifyClaim('skope는 memex에 종속되어서는 안 된다.')).toBe('rule');
    expect(classifyClaim('이메일 채널은 이미 소진되었으므로 재사냥해서는 안 된다.')).toBe('rule');
  });

  it('reads a comparison or a preference as a judgement', () => {
    expect(classifyClaim('anti-bias 6종 통합이 최고 ROI 항목이다.')).toBe('judgement');
    expect(classifyClaim('기존 MCP 서버를 HTTP로 다시 호출하는 방식은 안티패턴이다.')).toBe(
      'judgement',
    );
    expect(classifyClaim('첫시간 동원군을 만드는 것이 우선이다.')).toBe('judgement');
  });

  it('does not mistake a plain 야 inside a word for an obligation', () => {
    expect(classifyClaim('야근은 지난달에 두 번 있었다.')).toBe('event');
    expect(classifyClaim('분야별 매출은 3분기에 집계됐다.')).toBe('event');
  });
});
