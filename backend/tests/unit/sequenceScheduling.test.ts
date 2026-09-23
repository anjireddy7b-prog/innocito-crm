import { describe, it, expect } from 'vitest';
import {
  addBusinessDays,
  nextBusinessDay,
  clampToSendWindow,
  computeNextSendAt,
  shouldAutoPause,
  MAX_CONSECUTIVE_SEND_FAILURES,
} from '@/utils/sequenceScheduling';

// Phase 9 ("advanced CRM" slice) — sequences, Stage 2. All dates below are UTC (the engine's
// window is a single global UTC window — see sequenceScheduling.ts's module comment).

describe('nextBusinessDay', () => {
  it('returns the next day when it is a weekday', () => {
    // Tuesday 2026-09-22
    expect(nextBusinessDay(new Date('2026-09-22T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-23');
  });

  it('skips a weekend — Friday -> Monday', () => {
    // Friday 2026-09-25
    expect(nextBusinessDay(new Date('2026-09-25T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-28');
  });

  it('starting from a Saturday still lands on Monday', () => {
    expect(nextBusinessDay(new Date('2026-09-26T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-28');
  });
});

describe('addBusinessDays', () => {
  it('returns the same date unchanged for 0 or negative days', () => {
    const d = new Date('2026-09-22T10:00:00Z');
    expect(addBusinessDays(d, 0).getTime()).toBe(d.getTime());
    expect(addBusinessDays(d, -3).getTime()).toBe(d.getTime());
  });

  it('adds simple weekday-only days with no weekend in between', () => {
    // Monday + 2 business days = Wednesday
    expect(addBusinessDays(new Date('2026-09-21T10:00:00Z'), 2).toISOString().slice(0, 10)).toBe('2026-09-23');
  });

  it('skips the weekend when the delay spans one', () => {
    // Thursday 2026-09-24 + 3 business days: Fri(1), Mon(2), Tue(3) = 2026-09-29
    expect(addBusinessDays(new Date('2026-09-24T10:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-09-29');
  });

  it('starting from a weekend day itself still only counts business days forward', () => {
    // Saturday 2026-09-26 + 1 business day -> Monday 2026-09-28 (Sat/Sun never counted)
    expect(addBusinessDays(new Date('2026-09-26T10:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-09-28');
  });
});

describe('clampToSendWindow (window 9-18 UTC)', () => {
  it('leaves a time already inside the window on a weekday unchanged', () => {
    const d = new Date('2026-09-22T14:30:00Z'); // Tuesday, 14:30
    expect(clampToSendWindow(d, 9, 18).getTime()).toBe(d.getTime());
  });

  it('moves an early-morning time forward to the window start, same day', () => {
    const d = new Date('2026-09-22T03:00:00Z'); // Tuesday, 3am
    const clamped = clampToSendWindow(d, 9, 18);
    expect(clamped.toISOString()).toBe('2026-09-22T09:00:00.000Z');
  });

  it('moves a time at/after the window end to the next business day at window start', () => {
    const d = new Date('2026-09-22T19:00:00Z'); // Tuesday, 7pm
    const clamped = clampToSendWindow(d, 9, 18);
    expect(clamped.toISOString()).toBe('2026-09-23T09:00:00.000Z');
  });

  it('rolls a Friday-evening time to Monday, not Saturday', () => {
    const d = new Date('2026-09-25T19:00:00Z'); // Friday, 7pm
    const clamped = clampToSendWindow(d, 9, 18);
    expect(clamped.toISOString()).toBe('2026-09-28T09:00:00.000Z');
  });

  it('rolls a Saturday time to Monday at window start, even mid-window Saturday hours', () => {
    const d = new Date('2026-09-26T12:00:00Z'); // Saturday, noon
    const clamped = clampToSendWindow(d, 9, 18);
    expect(clamped.toISOString()).toBe('2026-09-28T09:00:00.000Z');
  });
});

describe('computeNextSendAt', () => {
  it('combines the business-day delay and the window clamp', () => {
    // Thursday 24th 20:00 (after window) + 1 business day = Friday 25th 20:00, still after
    // window -> rolls to the next business day (Monday 28th) at window start.
    const base = new Date('2026-09-24T20:00:00Z');
    const result = computeNextSendAt(base, 1, 9, 18);
    expect(result.toISOString()).toBe('2026-09-28T09:00:00.000Z');
  });

  it('a zero-delay step sent right now just clamps to the window, same day', () => {
    const base = new Date('2026-09-22T10:00:00Z'); // Tuesday, inside window
    expect(computeNextSendAt(base, 0, 9, 18).getTime()).toBe(base.getTime());
  });
});

describe('shouldAutoPause', () => {
  it('is false below the threshold and true at/above it', () => {
    expect(shouldAutoPause(0)).toBe(false);
    expect(shouldAutoPause(MAX_CONSECUTIVE_SEND_FAILURES - 1)).toBe(false);
    expect(shouldAutoPause(MAX_CONSECUTIVE_SEND_FAILURES)).toBe(true);
    expect(shouldAutoPause(MAX_CONSECUTIVE_SEND_FAILURES + 5)).toBe(true);
  });
});
