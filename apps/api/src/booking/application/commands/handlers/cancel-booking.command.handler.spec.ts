import { CancelBookingHandler } from './cancel-booking.command.handler';
import { CancelBookingCommand } from '@/booking/application/commands/cancel-booking.command';
import type { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import type { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import type { CancellationPolicyProviderPort } from '@/booking/application/ports/cancellation-policy.provider.port';
import type { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import type { OutboxPort } from '@/shared/outbox/outbox.port';
import { Booking } from '@/booking/domain/models/booking.model';
import { DateRange as BookingDateRange } from '@/booking/domain/vo/date-range.vo';
import { PartySize } from '@/booking/domain/vo/party-size.vo';
import { Money as BookingMoney } from '@/booking/domain/vo/money.vo';
import { CancellationPolicy } from '@/booking/domain/policies/cancellation-policy';
import { Hold } from '@/inventory/domain/models/hold.model';
import { DateRange as InventoryDateRange } from '@/inventory/domain/vo/date-range.vo';
import { BookingNotFoundException } from '@/booking/domain/exceptions/booking-not-found.exception';
import { BOOKING_CANCELLED } from '@/booking/domain/events/booking-cancelled.event';

/**
 * KEN'S EXECUTABLE SPEC for `CancelBookingHandler`. Ports mocked; the Booking and
 * Hold aggregates are REAL. RED until BOTH `Booking.cancel(outcome, now)` and the
 * handler's `execute` are implemented. Asserts: the 404-no-leak ownership gate (no
 * writes), and the happy path — cancel + hold.release + save both + outbox.enqueue
 * all inside the ONE transaction. Do not weaken it.
 */
describe('CancelBookingHandler', () => {
  const GUEST = '22222222-2222-2222-2222-222222222222';
  const LISTING = '11111111-1111-1111-1111-111111111111';

  let tx: jest.Mocked<TransactionManagerPort>;
  let bookings: jest.Mocked<BookingRepositoryPort>;
  let holds: jest.Mocked<HoldRepositoryPort>;
  let policies: jest.Mocked<CancellationPolicyProviderPort>;
  let outbox: jest.Mocked<OutboxPort>;
  let handler: CancelBookingHandler;

  /** A Confirmed booking owned by GUEST, with a committed hold behind it. */
  function makeConfirmedBooking(holdId: string): Booking {
    const b = Booking.create({
      guestId: GUEST,
      listingId: LISTING,
      holdId,
      dateRange: BookingDateRange.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-04T00:00:00.000Z'),
      ),
      partySize: PartySize.create(2),
      priceSnapshot: BookingMoney.create(33_000, 'USD'),
      holdExpiresAt: new Date('2026-07-31T00:00:00.000Z'),
    });
    b.confirm();
    return b;
  }

  function makeCommittedHold(): Hold {
    const h = Hold.create({
      listingId: LISTING,
      dateRange: InventoryDateRange.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-04T00:00:00.000Z'),
      ),
      ttlMinutes: 15,
    });
    h.commit();
    return h;
  }

  /** A policy stub that always allows the cancellation with a fixed refund. */
  function allowingPolicy(refundAmount: number): CancellationPolicy {
    return {
      evaluate: jest.fn().mockReturnValue({ allowed: true, refundAmount }),
    } as unknown as CancellationPolicy;
  }

  beforeEach(() => {
    // tx.run executes the unit of work immediately so we can assert the aggregate
    // methods + outbox enqueue all happened INSIDE the one transaction.
    tx = { run: jest.fn((work) => work()) } as unknown as jest.Mocked<TransactionManagerPort>;
    bookings = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BookingRepositoryPort>;
    holds = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HoldRepositoryPort>;
    policies = {
      forListing: jest.fn(),
    } as unknown as jest.Mocked<CancellationPolicyProviderPort>;
    outbox = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OutboxPort>;

    handler = new CancelBookingHandler(tx, bookings, holds, policies, outbox);
  });

  describe('ownership gate (404 no-leak)', () => {
    it('throws BookingNotFoundException and writes nothing when the booking is unknown', async () => {
      bookings.findById.mockResolvedValue(null);

      await expect(
        handler.execute(new CancelBookingCommand('missing-id', GUEST)),
      ).rejects.toBeInstanceOf(BookingNotFoundException);

      expect(bookings.save).not.toHaveBeenCalled();
      expect(holds.save).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('throws BookingNotFoundException (never 403) when the booking belongs to another guest', async () => {
      const booking = makeConfirmedBooking('hold-1'); // owned by GUEST
      bookings.findById.mockResolvedValue(booking);

      await expect(
        handler.execute(new CancelBookingCommand(booking.id, 'someone-else')),
      ).rejects.toBeInstanceOf(BookingNotFoundException);

      expect(bookings.save).not.toHaveBeenCalled();
      expect(holds.save).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('happy path (Confirmed → Cancelled, compensation shape)', () => {
    it('cancels the booking, releases the hold, saves both, and enqueues BookingCancelled — all in one transaction', async () => {
      const hold = makeCommittedHold();
      const booking = makeConfirmedBooking(hold.id);
      const cancelSpy = jest.spyOn(booking, 'cancel');
      const releaseSpy = jest.spyOn(hold, 'release');

      bookings.findById.mockResolvedValue(booking);
      holds.findById.mockResolvedValue(hold);
      policies.forListing.mockResolvedValue(allowingPolicy(16_500));

      const result = await handler.execute(
        new CancelBookingCommand(booking.id, GUEST, 'change of plans'),
      );

      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
      expect(bookings.save).toHaveBeenCalledWith(booking);
      expect(holds.save).toHaveBeenCalledWith(hold);
      expect(outbox.enqueue).toHaveBeenCalledWith(
        BOOKING_CANCELLED,
        booking.id,
        expect.objectContaining({
          bookingId: booking.id,
          guestId: GUEST,
          refundAmount: 16_500,
        }),
      );

      // The cancel + release + save + enqueue all happened within the transaction.
      expect(tx.run.mock.invocationCallOrder[0]).toBeLessThan(
        cancelSpy.mock.invocationCallOrder[0],
      );
      expect(tx.run.mock.invocationCallOrder[0]).toBeLessThan(
        outbox.enqueue.mock.invocationCallOrder[0],
      );

      // The response carries the recorded cancellation outcome.
      expect(result.id).toBe(booking.id);
      expect(result.status).toBe('Cancelled');
      expect(result.refundAmount).toBe(16_500);
      expect(typeof result.cancelledAt).toBe('string');
    });
  });
});
