import { describe, expect, it } from 'vitest';
import { AXIS_WEIGHTS, type AuditCounts, scoreAudit } from './audit.ts';

const counts = (over: Partial<AuditCounts> = {}): AuditCounts => ({
  grounded: { have: 10, total: 10 },
  fresh: { have: 10, total: 10 },
  connected: { have: 10, total: 10 },
  tidy: { have: 10, total: 10 },
  ...over,
});

describe('scoreAudit', () => {
  it('gives a full score when every axis is complete', () => {
    expect(scoreAudit(counts()).score).toBe(100);
  });

  it('treats an empty axis as full rather than punishing an absence', () => {
    const audit = scoreAudit(counts({ grounded: { have: 0, total: 0 } }));

    expect(audit.score).toBe(100);
    expect(audit.axes.find((axis) => axis.key === 'grounded')?.lost).toBe(0);
  });

  it('deducts the whole weight when an axis is entirely unmet', () => {
    const audit = scoreAudit(counts({ grounded: { have: 0, total: 107 } }));

    expect(audit.score).toBe(100 - AXIS_WEIGHTS.grounded);
    expect(audit.weakest?.key).toBe('grounded');
  });

  it('never lets one axis cost more than its weight', () => {
    const audit = scoreAudit(counts({ tidy: { have: -50, total: 10 } }));

    expect(audit.axes.find((axis) => axis.key === 'tidy')?.lost).toBe(AXIS_WEIGHTS.tidy);
    expect(audit.score).toBe(100 - AXIS_WEIGHTS.tidy);
  });

  it('names the axis that lost the most points, not the smallest ratio', () => {
    const audit = scoreAudit(
      counts({
        tidy: { have: 0, total: 10 },
        grounded: { have: 5, total: 10 },
      }),
    );

    expect(audit.weakest?.key).toBe('grounded');
  });

  it('drops the hint once there is nothing to repair', () => {
    const audit = scoreAudit(counts(), { id: 1, label: 'a note', detail: 'waiting' });

    expect(audit.weakest).toBeNull();
    expect(audit.hint).toBeNull();
  });

  it('keeps the hint while the weakest axis still costs points', () => {
    const audit = scoreAudit(counts({ fresh: { have: 1, total: 10 } }), {
      id: 7,
      label: 'a stale judgement',
      detail: '3 newer notes piled up since',
    });

    expect(audit.hint?.id).toBe(7);
  });
});
