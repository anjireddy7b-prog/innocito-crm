// Phase 9 ("advanced CRM" slice) — sequences, Stage 2. Pure date math for the sequences engine —
// no DB, no I/O — kept separate from sequences.service.ts so it's trivially unit-testable and so
// the engine's actual send/advance logic reads as "compute the next send time" + "act on it"
// rather than reimplementing calendar math inline. Everything here operates in UTC: the send
// window is a single global window, not per-organization (see config/env.ts's comment on why).

const MS_PER_DAY = 86_400_000;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday, Saturday
}

/** The next day after `date` that isn't a Saturday/Sunday (never returns `date` itself). */
export function nextBusinessDay(date: Date): Date {
  let result = new Date(date.getTime() + MS_PER_DAY);
  while (isWeekend(result)) {
    result = new Date(result.getTime() + MS_PER_DAY);
  }
  return result;
}

/**
 * Adds `days` BUSINESS days to `date` (Saturdays/Sundays are never counted, and never landed on).
 * `days <= 0` returns `date` unchanged — a step's delayDays of 0 means "no extra days", not "zero
 * business days from today" (which would still roll a weekend date forward — clampToSendWindow
 * below handles that instead, since a same-day-as-previous-step send should still respect the
 * window, not skip straight to Monday).
 */
export function addBusinessDays(date: Date, days: number): Date {
  if (days <= 0) return new Date(date.getTime());
  let result = new Date(date.getTime());
  let remaining = days;
  while (remaining > 0) {
    result = new Date(result.getTime() + MS_PER_DAY);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}

/**
 * Moves `date` into [startHour, endHour) UTC if it isn't already there, and off a weekend if it
 * landed on one:
 * - On a weekend → the next business day at startHour.
 * - Before startHour → the same day at startHour.
 * - At/after endHour → the next business day at startHour.
 * - Otherwise → unchanged (already inside the window on a weekday).
 */
export function clampToSendWindow(date: Date, startHour: number, endHour: number): Date {
  if (isWeekend(date)) {
    const rolled = nextBusinessDay(date);
    rolled.setUTCHours(startHour, 0, 0, 0);
    return rolled;
  }
  const hour = date.getUTCHours();
  if (hour < startHour) {
    const clamped = new Date(date.getTime());
    clamped.setUTCHours(startHour, 0, 0, 0);
    return clamped;
  }
  if (hour >= endHour) {
    const rolled = nextBusinessDay(date);
    rolled.setUTCHours(startHour, 0, 0, 0);
    return rolled;
  }
  return new Date(date.getTime());
}

/**
 * The one function sequences.service.ts actually calls: from `baseDate` (now, for the first step
 * after enrollment; a step's actual `sentAt`, for every later step), add the step's business-day
 * delay, then clamp into the send window. Composing the two separately (rather than one combined
 * function) is deliberate — each half has its own edge cases worth testing in isolation.
 */
export function computeNextSendAt(baseDate: Date, delayDays: number, startHour: number, endHour: number): Date {
  const advanced = addBusinessDays(baseDate, delayDays);
  return clampToSendWindow(advanced, startHour, endHour);
}

/** After this many consecutive FAILED send attempts on the same step, the engine auto-pauses the
 * enrollment rather than retrying forever — see sequences.service.ts's runDueSequenceSteps. Pure
 * threshold, exported so the decision itself is unit-testable without a DB. */
export const MAX_CONSECUTIVE_SEND_FAILURES = 3;

export function shouldAutoPause(consecutiveFailures: number): boolean {
  return consecutiveFailures >= MAX_CONSECUTIVE_SEND_FAILURES;
}
