import { DateRange } from './date-range.vo';
import { InvalidDateRangeException } from '@/booking/domain/exceptions/invalid-date-range.exception';

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * KEN'S EXECUTABLE SPEC for the Booking `DateRange` VO. Pure unit — ZERO mocks.
 * RED until you implement `date-range.vo.ts` (and its `InvalidDateRangeException`).
 * Pins the half-open `[checkIn, checkOut)` semantics: touching ranges do NOT
 * overlap.
 */
describe('DateRange (booking VO)', () => {
  describe('create', () => {
    it('accepts check-in strictly before check-out', () => {
      const range = DateRange.create(d('2026-07-01'), d('2026-07-04'));
      expect(range.checkIn).toStrictEqual(d('2026-07-01'));
      expect(range.checkOut).toStrictEqual(d('2026-07-04'));
    });

    it('rejects check-in equal to check-out (zero nights)', () => {
      expect(() => DateRange.create(d('2026-07-01'), d('2026-07-01'))).toThrow(
        InvalidDateRangeException,
      );
    });

    it('rejects check-in after check-out (inverted)', () => {
      expect(() => DateRange.create(d('2026-07-05'), d('2026-07-01'))).toThrow(
        InvalidDateRangeException,
      );
    });
  });

  describe('nights', () => {
    it('counts calendar nights between the bounds', () => {
      expect(DateRange.create(d('2026-07-01'), d('2026-07-04')).nights()).toBe(
        3,
      );
      expect(DateRange.create(d('2026-07-01'), d('2026-07-02')).nights()).toBe(
        1,
      );
    });
  });

  it('counts nights across a month boundary', () => {
    expect(DateRange.create(d('2026-01-30'), d('2026-02-02')).nights()).toBe(3);
  });

  describe('overlaps (half-open [in, out))', () => {
    const base = DateRange.create(d('2026-07-10'), d('2026-07-15'));

    it('is true when ranges share interior days', () => {
      const other = DateRange.create(d('2026-07-14'), d('2026-07-20'));
      expect(base.overlaps(other)).toBe(true);
      expect(other.overlaps(base)).toBe(true);
    });

    it('is false when one starts exactly where the other ends (touching)', () => {
      const after = DateRange.create(d('2026-07-15'), d('2026-07-20'));
      expect(base.overlaps(after)).toBe(false);
      expect(after.overlaps(base)).toBe(false);
    });

    it('is false for fully disjoint ranges', () => {
      const far = DateRange.create(d('2026-08-01'), d('2026-08-05'));
      expect(base.overlaps(far)).toBe(false);
    });

    it('is true when one range fully contains the other', () => {
      const inner = DateRange.create(d('2026-07-11'), d('2026-07-13'));
      expect(base.overlaps(inner)).toBe(true);
    });
  });

  describe('equals', () => {
    it('compares by value', () => {
      const a = DateRange.create(d('2026-07-01'), d('2026-07-04'));
      const b = DateRange.create(d('2026-07-01'), d('2026-07-04'));
      expect(a.equals(b)).toBe(true);
    });
  });
});
