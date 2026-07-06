import { InvalidDateRangeException } from '@/booking/domain/exceptions/invalid-date-range.exception';

/**
 * KEN'S FILL FILE — stub. Booking BC's OWN copy of `DateRange` (BC-2 keeps a
 * separate copy; no shared kernel for domain VOs). A half-open `[checkIn,
 * checkOut)` calendar range: check-in included, check-out excluded, so touching
 * ranges do NOT overlap. Immutable; compared by value. Your spec is
 * `date-range.vo.spec.ts`.
 *
 * Implementation hints (see the passing BC-2 copy in `inventory/domain/vo` if you
 * get stuck, but write your own):
 * - `create`: throw `InvalidDateRangeException` unless check-in is strictly
 *   before check-out. Consider normalizing both to UTC midnight so night-counting
 *   and overlap are pure calendar arithmetic.
 * - `nights`: whole nights between the bounds (≥ 1).
 * - `overlaps`: `aIn < bOut && bIn < aOut`.
 */
export class DateRange {
  private constructor(
    private readonly _checkIn: Date,
    private readonly _checkOut: Date,
  ) {}

  static create(checkIn: Date, checkOut: Date): DateRange {
    if (checkIn >= checkOut) {
      throw new InvalidDateRangeException(checkIn, checkOut);
    }

    return new DateRange(new Date(checkIn), new Date(checkOut));
  }

  /** Rebuild from trusted persisted values (no re-validation). */
  static reconstitute(checkIn: Date, checkOut: Date): DateRange {
    return new DateRange(new Date(checkIn), new Date(checkOut));
  }

  get checkIn(): Date {
    return new Date(this._checkIn);
  }

  get checkOut(): Date {
    return new Date(this._checkOut);
  }

  /** Number of nights (≥ 1). */
  nights(): number {
    return Math.round(
      (this._checkOut.getTime() - this._checkIn.getTime()) / 86_400_000,
    );
  }

  /** Half-open overlap: touching ranges (out === in) do NOT overlap. */
  overlaps(other: DateRange): boolean {
    return this._checkIn < other._checkOut && other._checkIn < this._checkOut;
  }

  /** Value equality. */
  equals(other: DateRange): boolean {
    return (
      this._checkIn.getTime() === other._checkIn.getTime() &&
      this._checkOut.getTime() === other._checkOut.getTime()
    );
  }
}
