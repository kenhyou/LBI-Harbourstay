import type { UnavailableRange } from '@harbourstay/shared';

/**
 * Calendar date helpers for the availability calendar. Everything operates on
 * `YYYY-MM-DD` strings in **UTC** so there is no timezone drift: a calendar day
 * is a pure date, never a wall-clock instant. Parsing/formatting always pins to
 * UTC midnight, and arithmetic goes through the Date epoch so month/year rollover
 * is handled by the platform.
 */

/** Parse a `YYYY-MM-DD` string to a Date at UTC midnight. */
export function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Format a Date to its `YYYY-MM-DD` calendar day in UTC. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar day in UTC as `YYYY-MM-DD`. */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Add `n` days (may be negative) to a `YYYY-MM-DD` string. */
export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

/** First day of the month containing `iso`, as `YYYY-MM-DD`. */
export function startOfMonth(iso: string): string {
  const d = parseISODate(iso);
  d.setUTCDate(1);
  return toISODate(d);
}

/** Add `n` months (may be negative) to the month start of `iso`. */
export function addMonths(iso: string, n: number): string {
  const d = parseISODate(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toISODate(d);
}

/** Day-of-week for `iso`, 0 = Sunday … 6 = Saturday (UTC). */
export function dayOfWeek(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

/** Human month + year label, e.g. "July 2026". */
export function monthLabel(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Long, screen-reader-friendly label for one day, e.g. "Friday, July 3, 2026". */
export function longDateLabel(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Day-of-month number (1..31) for `iso`. */
export function dayOfMonth(iso: string): number {
  return parseISODate(iso).getUTCDate();
}

/** True if `iso` falls in the month that starts at `monthStartISO`. */
export function isSameMonth(iso: string, monthStartISO: string): boolean {
  return startOfMonth(iso) === monthStartISO;
}

/**
 * The 42 days (6 weeks, Sunday-first) that make up a month grid for
 * `monthStartISO`. Always a fixed 6-week block so the grid never reflows between
 * months; callers dim the days that fall outside the month.
 */
export function monthGridDays(monthStartISO: string): string[] {
  const first = startOfMonth(monthStartISO);
  const gridStart = addDays(first, -dayOfWeek(first));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/**
 * Expand the API's half-open `[checkIn, checkOut)` taken ranges into the set of
 * individual **taken nights** (each `YYYY-MM-DD`). The checkout day of a range is
 * deliberately NOT included — under half-open semantics that day's night is free,
 * so a new guest may check in on it. A day is bookable as a check-in only if its
 * night is absent from this set.
 */
export function takenNights(ranges: readonly UnavailableRange[]): Set<string> {
  const nights = new Set<string>();
  for (const r of ranges) {
    for (let d = r.checkIn; d < r.checkOut; d = addDays(d, 1)) {
      nights.add(d);
    }
  }
  return nights;
}

/**
 * All nights spent by a stay `[checkIn, checkOut)` — the days a guest occupies.
 * Used to validate a selected range contains no taken night and to render the
 * in-range highlight.
 */
export function nightsInStay(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}
