import { BookingStatus } from '@/booking/domain/enums/booking-status.enum';
import { CancellationPolicy } from '@/booking/domain/policies/cancellation-policy';

/**
 * KEN'S EXECUTABLE SPEC for `CancellationPolicy.evaluate`. Pure unit — ZERO mocks,
 * DETERMINISTIC (`now` is always injected, never `Date.now()`). Table-driven across
 * the refund tiers, pinning the boundaries (exactly 7 days, exactly 48h, 47h, on/
 * after check-in). RED until you implement `evaluate`; do not weaken it.
 *
 * Fixtures: a Confirmed booking checking in at 2026-07-10T00:00Z, total 33_000
 * minor units. `now` moves earlier/later to land in each tier.
 */
describe('CancellationPolicy.standard().evaluate', () => {
  const policy = CancellationPolicy.standard();
  const CHECK_IN = new Date('2026-07-10T00:00:00.000Z');
  const PRICE = 33_000; // minor units (cents)

  const at = (iso: string): Date => new Date(iso);

  describe('PendingPayment — always cancellable, nothing captured yet', () => {
    it('allows cancel with a zero refund well before check-in', () => {
      const out = policy.evaluate(
        BookingStatus.PendingPayment,
        CHECK_IN,
        at('2026-07-01T00:00:00.000Z'),
        PRICE,
      );
      expect(out).toEqual({ allowed: true, refundAmount: 0 });
    });

    it('allows cancel with a zero refund even the day before check-in', () => {
      const out = policy.evaluate(
        BookingStatus.PendingPayment,
        CHECK_IN,
        at('2026-07-09T00:00:00.000Z'),
        PRICE,
      );
      expect(out.allowed).toBe(true);
      expect(out.refundAmount).toBe(0);
    });
  });

  describe('Confirmed — tiered refund on the days-before-check-in gap', () => {
    it('≥ 7 days before check-in → full (100%) refund', () => {
      const out = policy.evaluate(
        BookingStatus.Confirmed,
        CHECK_IN,
        at('2026-07-01T00:00:00.000Z'), // 9 days before
        PRICE,
      );
      expect(out).toEqual({ allowed: true, refundAmount: 33_000 });
    });

    it('EXACTLY 7 days before check-in → full (100%) refund (inclusive boundary)', () => {
      const out = policy.evaluate(
        BookingStatus.Confirmed,
        CHECK_IN,
        at('2026-07-03T00:00:00.000Z'), // exactly 7×24h before
        PRICE,
      );
      expect(out).toEqual({ allowed: true, refundAmount: 33_000 });
    });

    it('3 days before check-in → 50% refund', () => {
      const out = policy.evaluate(
        BookingStatus.Confirmed,
        CHECK_IN,
        at('2026-07-07T00:00:00.000Z'), // 3 days before
        PRICE,
      );
      expect(out).toEqual({ allowed: true, refundAmount: 16_500 });
    });

    it('EXACTLY 48h before check-in → 50% refund (lower edge of the 2-day tier)', () => {
      const out = policy.evaluate(
        BookingStatus.Confirmed,
        CHECK_IN,
        at('2026-07-08T00:00:00.000Z'), // exactly 48h before
        PRICE,
      );
      expect(out.allowed).toBe(true);
      expect(out.refundAmount).toBe(16_500);
    });

    it('floors the 50% refund to whole minor units (never over-refund)', () => {
      const out = policy.evaluate(
        BookingStatus.Confirmed,
        CHECK_IN,
        at('2026-07-07T00:00:00.000Z'), // 3 days before → 50% tier
        33_001, // odd total → 16_500.5, must floor to 16_500
      );
      expect(out.refundAmount).toBe(16_500);
    });

    it('47h before check-in → REJECTED (inside the 48h no-refund window)', () => {
      const out = policy.evaluate(
        BookingStatus.Confirmed,
        CHECK_IN,
        at('2026-07-08T01:00:00.000Z'), // 47h before
        PRICE,
      );
      expect(out.allowed).toBe(false);
      expect(out.refundAmount).toBe(0);
      expect(out.reason).toBeTruthy();
    });

    it('exactly at check-in → REJECTED', () => {
      const out = policy.evaluate(
        BookingStatus.Confirmed,
        CHECK_IN,
        at('2026-07-10T00:00:00.000Z'),
        PRICE,
      );
      expect(out.allowed).toBe(false);
      expect(out.refundAmount).toBe(0);
    });

    it('after check-in → REJECTED', () => {
      const out = policy.evaluate(
        BookingStatus.Confirmed,
        CHECK_IN,
        at('2026-07-11T00:00:00.000Z'),
        PRICE,
      );
      expect(out.allowed).toBe(false);
      expect(out.refundAmount).toBe(0);
    });
  });

  describe('terminal / non-cancellable statuses → REJECTED', () => {
    it.each([
      BookingStatus.Completed,
      BookingStatus.Cancelled,
      BookingStatus.Expired,
      BookingStatus.NoShow,
    ])('rejects cancellation from %s', (status) => {
      const out = policy.evaluate(
        status,
        CHECK_IN,
        at('2026-07-01T00:00:00.000Z'),
        PRICE,
      );
      expect(out.allowed).toBe(false);
      expect(out.refundAmount).toBe(0);
    });
  });
});
