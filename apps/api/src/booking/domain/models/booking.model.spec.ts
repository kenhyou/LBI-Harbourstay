import { Booking } from './booking.model';
import { DateRange } from '@/booking/domain/vo/date-range.vo';
import { PartySize } from '@/booking/domain/vo/party-size.vo';
import { Money } from '@/booking/domain/vo/money.vo';
import { BookingStatus } from '@/booking/domain/enums/booking-status.enum';
import { InvalidBookingStateException } from '@/booking/domain/exceptions/invalid-booking-state.exception';
import type { CancellationOutcome } from '@/booking/domain/policies/cancellation-policy';

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * KEN'S EXECUTABLE SPEC for the `Booking` aggregate. Pure unit — ZERO mocks.
 * Positive AND negative per state transition; no state may be skipped;
 * `priceSnapshot` is immutable once set.
 *
 * The `cancel` block is the S5 FILL target and is RED until you implement
 * `cancel(outcome, now)` — the rest is your already-green S3 domain. Do NOT weaken
 * this spec to pass a stub.
 */
describe('Booking (aggregate root)', () => {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const NOW = new Date('2026-06-25T12:00:00.000Z');
  const allow = (refundAmount: number): CancellationOutcome => ({
    allowed: true,
    refundAmount,
  });
  const deny: CancellationOutcome = {
    allowed: false,
    refundAmount: 0,
    reason: 'Inside the 48h no-refund window',
  };

  function newBooking(): Booking {
    return Booking.create({
      guestId: '11111111-1111-4111-8111-111111111111',
      listingId: '22222222-2222-4222-8222-222222222222',
      holdId: '33333333-3333-4333-8333-333333333333',
      dateRange: DateRange.create(d('2026-07-01'), d('2026-07-04')),
      partySize: PartySize.create(2),
      priceSnapshot: Money.create(33_000, 'USD'),
      holdExpiresAt: d('2026-06-30'),
    });
  }

  const confirmed = (): Booking => {
    const b = newBooking();
    b.confirm();
    return b;
  };
  const completed = (): Booking => {
    const b = confirmed();
    b.complete();
    return b;
  };
  // Build a Cancelled/Expired booking via reconstitute (NOT cancel()/expire()) so
  // the confirm/complete guards can be tested without depending on the S5 cancel
  // fill — reconstitute is already-green S3 plumbing.
  const reconstituteWith = (status: BookingStatus): Booking =>
    Booking.reconstitute({
      id: '55555555-5555-4555-8555-555555555555',
      guestId: '11111111-1111-4111-8111-111111111111',
      listingId: '22222222-2222-4222-8222-222222222222',
      holdId: '33333333-3333-4333-8333-333333333333',
      dateRange: DateRange.create(d('2026-07-01'), d('2026-07-04')),
      partySize: PartySize.create(2),
      status,
      priceSnapshot: Money.reconstitute(33_000, 'USD'),
      holdExpiresAt: d('2026-06-30'),
      createdAt: d('2026-06-29'),
      cancelledAt: status === BookingStatus.Cancelled ? d('2026-07-02') : null,
      refundAmount: status === BookingStatus.Cancelled ? 33_000 : null,
    });
  const cancelled = (): Booking => reconstituteWith(BookingStatus.Cancelled);
  const expired = (): Booking => reconstituteWith(BookingStatus.Expired);

  describe('create', () => {
    it('starts in PendingPayment with a fresh uuid id', () => {
      const b = newBooking();
      expect(b.id).toMatch(UUID_RE);
      expect(b.status).toBe(BookingStatus.PendingPayment);
    });

    it('exposes the references and VOs it was built from', () => {
      const b = newBooking();
      expect(b.guestId).toBe('11111111-1111-4111-8111-111111111111');
      expect(b.listingId).toBe('22222222-2222-4222-8222-222222222222');
      expect(b.holdId).toBe('33333333-3333-4333-8333-333333333333');
      expect(b.partySize.value).toBe(2);
      expect(b.priceSnapshot.amount).toBe(33_000);
      expect(b.dateRange.nights()).toBe(3);
    });

    it('starts with no cancellation recorded', () => {
      const b = newBooking();
      expect(b.cancelledAt).toBeNull();
      expect(b.refundAmount).toBeNull();
    });

    it('stamps createdAt with a Date and gives distinct ids', () => {
      const a = newBooking();
      const b = newBooking();
      expect(a.createdAt).toBeInstanceOf(Date);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('confirm (PendingPayment -> Confirmed)', () => {
    it('confirms a pending booking', () => {
      const b = newBooking();
      b.confirm();
      expect(b.status).toBe(BookingStatus.Confirmed);
    });

    it('cannot confirm an already-confirmed booking', () => {
      expect(() => confirmed().confirm()).toThrow(InvalidBookingStateException);
    });

    it('cannot confirm a cancelled booking', () => {
      expect(() => cancelled().confirm()).toThrow(InvalidBookingStateException);
    });

    it('cannot confirm an expired booking', () => {
      expect(() => expired().confirm()).toThrow(InvalidBookingStateException);
    });
  });

  describe('complete (Confirmed -> Completed)', () => {
    it('completes a confirmed booking', () => {
      const b = confirmed();
      b.complete();
      expect(b.status).toBe(BookingStatus.Completed);
    });

    it('cannot complete a pending booking (no state-skipping)', () => {
      expect(() => newBooking().complete()).toThrow(
        InvalidBookingStateException,
      );
    });

    it('cannot complete a cancelled booking', () => {
      expect(() => cancelled().complete()).toThrow(
        InvalidBookingStateException,
      );
    });
  });

  describe('cancel (outcome, now) — S5 FILL target', () => {
    it('cancels a confirmed booking with an allowed outcome, recording cancelledAt + refundAmount', () => {
      const b = confirmed();
      b.cancel(allow(33_000), NOW);
      expect(b.status).toBe(BookingStatus.Cancelled);
      expect(b.refundAmount).toBe(33_000);
      expect(b.cancelledAt).toEqual(NOW);
    });

    it('cancels a pending booking with a zero refund', () => {
      const b = newBooking();
      b.cancel(allow(0), NOW);
      expect(b.status).toBe(BookingStatus.Cancelled);
      expect(b.refundAmount).toBe(0);
      expect(b.cancelledAt).toEqual(NOW);
    });

    it('throws when the outcome forbids cancellation, leaving the status unchanged', () => {
      const b = confirmed();
      expect(() => b.cancel(deny, NOW)).toThrow(InvalidBookingStateException);
      expect(b.status).toBe(BookingStatus.Confirmed);
      expect(b.cancelledAt).toBeNull();
      expect(b.refundAmount).toBeNull();
    });

    it('cannot cancel a completed booking even with an allowed outcome', () => {
      expect(() => completed().cancel(allow(33_000), NOW)).toThrow(
        InvalidBookingStateException,
      );
    });

    it('cannot cancel an expired booking even with an allowed outcome', () => {
      expect(() => expired().cancel(allow(33_000), NOW)).toThrow(
        InvalidBookingStateException,
      );
    });
  });

  describe('expire (PendingPayment -> Expired)', () => {
    it('expires a pending booking', () => {
      const b = newBooking();
      b.expire();
      expect(b.status).toBe(BookingStatus.Expired);
    });

    it('cannot expire a confirmed booking', () => {
      expect(() => confirmed().expire()).toThrow(InvalidBookingStateException);
    });
  });

  describe('markNoShow (Confirmed -> NoShow)', () => {
    it('marks a confirmed booking as no-show', () => {
      const b = confirmed();
      b.markNoShow();
      expect(b.status).toBe(BookingStatus.NoShow);
    });

    it('cannot mark a pending booking as no-show (no state-skipping)', () => {
      expect(() => newBooking().markNoShow()).toThrow(
        InvalidBookingStateException,
      );
    });
  });

  describe('priceSnapshot immutability', () => {
    it('keeps the frozen price across a state transition', () => {
      const b = newBooking();
      const before = b.priceSnapshot.amount;
      b.confirm();
      expect(b.priceSnapshot.amount).toBe(before);
    });
  });

  describe('reconstitute', () => {
    it('round-trips every field without generating a new id', () => {
      const snapshot = {
        id: '44444444-4444-4444-8444-444444444444',
        guestId: '11111111-1111-4111-8111-111111111111',
        listingId: '22222222-2222-4222-8222-222222222222',
        holdId: '33333333-3333-4333-8333-333333333333',
        dateRange: DateRange.create(d('2026-07-01'), d('2026-07-04')),
        partySize: PartySize.create(2),
        status: BookingStatus.Confirmed,
        priceSnapshot: Money.reconstitute(33_000, 'USD'),
        holdExpiresAt: d('2026-06-30'),
        createdAt: d('2026-06-29'),
      };
      const b = Booking.reconstitute(snapshot);
      expect(b.id).toBe(snapshot.id);
      expect(b.status).toBe(BookingStatus.Confirmed);
      expect(b.priceSnapshot.amount).toBe(33_000);
    });

    it('restores the cancellation fields for a cancelled booking', () => {
      const b = reconstituteWith(BookingStatus.Cancelled);
      expect(b.status).toBe(BookingStatus.Cancelled);
      expect(b.cancelledAt).toEqual(d('2026-07-02'));
      expect(b.refundAmount).toBe(33_000);
    });
  });
});
