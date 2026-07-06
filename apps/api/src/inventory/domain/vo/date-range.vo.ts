import { InvalidDateRangeException } from '@/inventory/domain/exceptions/invalid-date-range.exception';

const MS_PER_NIGHT = 24 * 60 * 60 * 1000;

/**
 * BC-2's OWN copy of `DateRange` (Booking BC keeps a separate copy — no shared
 * kernel for domain VOs). A half-open `[checkIn, checkOut)` calendar range:
 * check-in is included, check-out is not, so back-to-back stays (…, out=in, …)
 * do NOT overlap. Immutable; compared by value.
 *
 * Dates are normalized to UTC midnight so night counting and overlap are pure
 * calendar-day arithmetic, free of local-timezone/DST drift.
 */
export class DateRange {
  private constructor(
    private readonly _checkIn: Date,
    private readonly _checkOut: Date,
  ) {}

  static create(checkIn: Date, checkOut: Date): DateRange {
    const inUtc = DateRange.toUtcMidnight(checkIn);
    const outUtc = DateRange.toUtcMidnight(checkOut);
    if (inUtc.getTime() >= outUtc.getTime()) {
      throw new InvalidDateRangeException(inUtc, outUtc);
    }
    return new DateRange(inUtc, outUtc);
  }

  /** Rebuild from trusted persisted values (no re-validation). */
  static reconstitute(checkIn: Date, checkOut: Date): DateRange {
    return new DateRange(
      DateRange.toUtcMidnight(checkIn),
      DateRange.toUtcMidnight(checkOut),
    );
  }

  get checkIn(): Date {
    return new Date(this._checkIn);
  }

  get checkOut(): Date {
    return new Date(this._checkOut);
  }

  /** Number of nights = calendar days between check-in and check-out (≥ 1). */
  nights(): number {
    return Math.round(
      (this._checkOut.getTime() - this._checkIn.getTime()) / MS_PER_NIGHT,
    );
  }

  /** Half-open overlap: `aIn < bOut && bIn < aOut`. Touching ranges do NOT overlap. */
  overlaps(other: DateRange): boolean {
    return (
      this._checkIn.getTime() < other._checkOut.getTime() &&
      other._checkIn.getTime() < this._checkOut.getTime()
    );
  }

  equals(other: DateRange): boolean {
    return (
      this._checkIn.getTime() === other._checkIn.getTime() &&
      this._checkOut.getTime() === other._checkOut.getTime()
    );
  }

  private static toUtcMidnight(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}
