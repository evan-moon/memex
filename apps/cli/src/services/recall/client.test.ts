import { describe, expect, it } from 'vitest';
import { isRecallablePrompt, toRecallQuery } from './client.ts';

describe('isRecallablePrompt', () => {
  it('recalls on what a person types', () => {
    expect(isRecallablePrompt('memex 검색 품질 어떻게 측정했더라?')).toBe(true);
    expect(isRecallablePrompt('opula 펀딩 요금제 다시 보자')).toBe(true);
  });

  it('skips slash commands, bangs and one-word prompts', () => {
    expect(isRecallablePrompt('/clear')).toBe(false);
    expect(isRecallablePrompt('!ls -la ~/.memex')).toBe(false);
    expect(isRecallablePrompt('푸시해')).toBe(false);
  });

  it('skips what the harness sends rather than the person', () => {
    expect(isRecallablePrompt('<task-notification>\n<task-id>bzkdfrct9</task-id>')).toBe(false);
    expect(isRecallablePrompt("<system-reminder>\nAs you answer the user's questions")).toBe(false);
    expect(
      isRecallablePrompt('Your claude.ai usage limit has reset. Continue the task you were on.'),
    ).toBe(false);
  });

  it("skips memex's own judging prompts", () => {
    expect(
      isRecallablePrompt(
        'You audit a personal second brain written mostly in Korean.\n\nTwo of its judgements are below.',
      ),
    ).toBe(false);
    expect(
      isRecallablePrompt(
        'Below is a "state" note from a personal second brain: a note recording positions its author currently holds.',
      ),
    ).toBe(false);
    expect(
      isRecallablePrompt(
        'You help a person write and look after their second brain — the notes an AI recorded for them.',
      ),
    ).toBe(false);
  });

  it('lets a person ask about their own second brain', () => {
    expect(isRecallablePrompt('내 세컨드 브레인에 이거 저장돼 있었나?')).toBe(true);
    expect(isRecallablePrompt('second brain 검색이 왜 이렇게 느려?')).toBe(true);
  });

  it('judges the query it would embed, not the whole paste', () => {
    const pasted = `${'가'.repeat(320)} a personal second brain written mostly in Korean`;
    expect(toRecallQuery(pasted).length).toBe(300);
    expect(isRecallablePrompt(pasted)).toBe(true);
  });
});
