import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { DeckCard } from './api.ts';
import { dictionaries, type Locale, setLocale } from './i18n.ts';
import { aimOf, DeckCardFace, DeckEmpty } from './Review.tsx';

const card = (over: Partial<DeckCard> = {}): DeckCard => ({
  key: 'claim:12',
  kind: 'claim',
  id: 12,
  text: 'Opula의 채팅은 Groq에서 gpt-oss-120b를 돌린다',
  heading: null,
  since: Date.parse('2026-08-03'),
  confirmedAt: null,
  idleDays: 34,
  injected: { hits: 3, days: 30 },
  source: { id: 900, title: 'Opula 인앱 채팅 LLM 비용 비교' },
  evidenceMoved: false,
  ...over,
});

const render = (node: React.ReactNode, locale: Locale = 'ko') => {
  setLocale(locale);
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
};

const face = (over: Partial<DeckCard> = {}, open = false) =>
  render(<DeckCardFace card={card(over)} open={open} onToggleEvidence={() => {}} />);

describe('a deck card', () => {
  const t = dictionaries.ko;

  it('leads with the claim, not the note it came from', () => {
    const html = face();

    expect(html).toContain('Opula의 채팅은 Groq에서 gpt-oss-120b를 돌린다');
    expect(html).not.toContain('Opula 인앱 채팅 LLM 비용 비교');
  });

  it('sets the claim far above everything around it', () => {
    const html = face();

    expect(html).toContain('text-[20px]');
    expect(html).toContain('text-[11px]');
  });

  it('says how often the AI actually said it', () => {
    expect(face()).toContain(t.deck.spoken(3, 30));
    expect(face({ injected: { hits: 0, days: 30 } })).toContain(t.deck.spokenNone);
  });

  it('says a claim has never been checked rather than showing a blank', () => {
    expect(face()).toContain(t.deck.neverChecked);
    expect(face({ confirmedAt: Date.parse('2026-08-20'), idleDays: 17 })).toContain(
      t.deck.idle(17),
    );
  });

  it('marks a claim whose source moved, and says what that means', () => {
    const html = face({ evidenceMoved: true });

    expect(html).toContain(t.deck.moved);
    expect(html).toContain(t.deck.movedLead);
  });

  it('does not put the moved badge on a hypothesis, which is always drifted', () => {
    expect(face({ kind: 'inference', evidenceMoved: true })).not.toContain(t.deck.moved);
  });

  it('keeps the evidence folded until it is asked for', () => {
    expect(face()).not.toContain('Opula 인앱 채팅 LLM 비용 비교');
    expect(face({}, true)).toContain('Opula 인앱 채팅 LLM 비용 비교');
  });

  it('carries the section the claim was read out of, when the note has one', () => {
    const t = dictionaries.ko;
    expect(face({ heading: '비용 비교' })).toContain('Opula 인앱 채팅 LLM 비용 비교 · 비용 비교');
    expect(face()).not.toContain(t.deck.evidence + ' · ');
  });

  it('names each kind so a rule does not read as a claim', () => {
    expect(face()).toContain(t.deck.kindClaim);
    expect(face({ kind: 'rule' })).toContain(t.deck.kindRule);
    expect(face({ kind: 'inference' })).toContain(t.deck.kindInference);
  });
});

describe('a swipe', () => {
  it('does nothing until the card is pulled far enough to mean it', () => {
    expect(aimOf({ x: 40, y: 0, live: false })).toBeNull();
    expect(aimOf({ x: -60, y: 0, live: false })).toBeNull();
    expect(aimOf({ x: 0, y: 90, live: false })).toBeNull();
  });

  it('reads right as still right and left as changed', () => {
    expect(aimOf({ x: 160, y: 10, live: false })).toBe('confirm');
    expect(aimOf({ x: -160, y: 10, live: false })).toBe('correct');
  });

  it('reads down as later, and lets the bigger pull win a diagonal', () => {
    expect(aimOf({ x: 10, y: 180, live: false })).toBe('defer');
    expect(aimOf({ x: 200, y: 140, live: false })).toBe('confirm');
    expect(aimOf({ x: 60, y: 200, live: false })).toBe('defer');
  });
});

describe('the two directions', () => {
  const t = dictionaries.ko;

  // The hint reads in the order the buttons sit, so the sentence and the row
  // never disagree about which way a verdict lies.
  it('lists the keys in the order the buttons are laid out', () => {
    const order = ['←', '↓', '→'].map((arrow) => t.deck.keys.indexOf(arrow));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((at) => at >= 0)).toBe(true);
  });

  it('keeps still-right on the right and changed on the left', () => {
    expect(t.deck.keys.indexOf(t.deck.correct)).toBeLessThan(t.deck.keys.indexOf(t.deck.confirm));
  });
});

describe('the end of a deck', () => {
  const t = dictionaries.ko;

  it('closes the session rather than opening the next one', () => {
    const html = render(<DeckEmpty done />);

    expect(html).toContain(t.deck.doneTitle);
    expect(html).toContain(t.deck.doneLead);
  });

  it('says the memories are safe when there was nothing to begin with', () => {
    const html = render(<DeckEmpty done={false} />);

    expect(html).toContain(t.deck.emptyTitle);
    expect(html).toContain(t.deck.emptyLead);
  });

  it('never shows a standing count of what is left', () => {
    expect(render(<DeckEmpty done />)).not.toMatch(/\d+\s*(개|건|items)/);
    expect(render(<DeckEmpty done={false} />)).not.toMatch(/\d+\s*(개|건|items)/);
  });
});
