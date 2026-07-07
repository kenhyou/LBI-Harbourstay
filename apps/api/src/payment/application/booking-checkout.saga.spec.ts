import { BookingCheckoutSaga } from './booking-checkout.saga';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { OutboxPort } from '@/shared/outbox/outbox.port';
import { PaymentLookupPort } from '@/payment/application/ports/payment-lookup.port';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { Booking } from '@/booking/domain/models/booking.model';
import { DateRange as BookingDateRange } from '@/booking/domain/vo/date-range.vo';
import { PartySize } from '@/booking/domain/vo/party-size.vo';
import { Money as BookingMoney } from '@/booking/domain/vo/money.vo';
import { Hold } from '@/inventory/domain/models/hold.model';
import { DateRange as InventoryDateRange } from '@/inventory/domain/vo/date-range.vo';
import { BOOKING_CONFIRMED } from '@/booking/domain/events/booking-confirmed.event';

/**
 * KEN'S EXECUTABLE SPEC for `BookingCheckoutSaga`. Ports are mocked; the Booking
 * and Hold aggregates are REAL (their state machines already pass in S3), so this
 * asserts the saga drives the right domain methods in ONE transaction. RED until
 * you implement the three saga methods; do not weaken it to pass the stub.
 */
describe('BookingCheckoutSaga', () => {
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';
  const GUEST_ID = '22222222-2222-2222-2222-222222222222';

  let tx: jest.Mocked<TransactionManagerPort>;
  let lookup: jest.Mocked<PaymentLookupPort>;
  let bookings: jest.Mocked<BookingRepositoryPort>;
  let holds: jest.Mocked<HoldRepositoryPort>;
  let outbox: jest.Mocked<OutboxPort>;
  let saga: BookingCheckoutSaga;

  function makeBooking(holdId: string): Booking {
    return Booking.create({
      guestId: GUEST_ID,
      listingId: LISTING_ID,
      holdId,
      dateRange: BookingDateRange.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-04T00:00:00.000Z'),
      ),
      partySize: PartySize.create(2),
      priceSnapshot: BookingMoney.create(33_000, 'USD'),
      holdExpiresAt: new Date(Date.now() + 15 * 60_000),
    });
  }

  function makeHold(): Hold {
    return Hold.create({
      listingId: LISTING_ID,
      dateRange: InventoryDateRange.create(
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-04T00:00:00.000Z'),
      ),
      ttlMinutes: 15,
    });
  }

  beforeEach(() => {
    // tx.run executes the unit of work immediately, so we can assert the aggregate
    // methods + outbox enqueue all happened INSIDE the one transaction.
    tx = { run: jest.fn((work) => work()) } as unknown as jest.Mocked<TransactionManagerPort>;
    lookup = { lookup: jest.fn() } as unknown as jest.Mocked<PaymentLookupPort>;
    bookings = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BookingRepositoryPort>;
    holds = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HoldRepositoryPort>;
    outbox = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OutboxPort>;

    saga = new BookingCheckoutSaga(tx, lookup, bookings, holds, outbox);
  });

  describe('onPaymentSucceeded (confirm path)', () => {
    it('confirms the booking, commits the hold, and enqueues BookingConfirmed — all in one transaction', async () => {
      const hold = makeHold();
      const booking = makeBooking(hold.id);
      const confirmSpy = jest.spyOn(booking, 'confirm');
      const commitSpy = jest.spyOn(hold, 'commit');

      lookup.lookup.mockResolvedValue({
        bookingId: booking.id,
        holdId: hold.id,
        amount: 33_000,
      });
      bookings.findById.mockResolvedValue(booking);
      holds.findById.mockResolvedValue(hold);

      await saga.onPaymentSucceeded('payment-1');

      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(bookings.save).toHaveBeenCalledWith(booking);
      expect(holds.save).toHaveBeenCalledWith(hold);
      expect(outbox.enqueue).toHaveBeenCalledWith(
        BOOKING_CONFIRMED,
        booking.id,
        expect.objectContaining({ bookingId: booking.id }),
      );

      // The confirm+commit+enqueue happened within the transaction, not before it.
      expect(tx.run.mock.invocationCallOrder[0]).toBeLessThan(
        confirmSpy.mock.invocationCallOrder[0],
      );
      expect(tx.run.mock.invocationCallOrder[0]).toBeLessThan(
        (outbox.enqueue.mock.invocationCallOrder[0]),
      );
    });
  });

  describe('onPaymentFailed (compensation)', () => {
    it('releases the hold and expires the booking (no outbox event)', async () => {
      const hold = makeHold();
      const booking = makeBooking(hold.id);
      const releaseSpy = jest.spyOn(hold, 'release');
      const expireSpy = jest.spyOn(booking, 'expire');

      lookup.lookup.mockResolvedValue({
        bookingId: booking.id,
        holdId: hold.id,
        amount: 33_000,
      });
      bookings.findById.mockResolvedValue(booking);
      holds.findById.mockResolvedValue(hold);

      await saga.onPaymentFailed('payment-1');

      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
      expect(expireSpy).toHaveBeenCalledTimes(1);
      expect(bookings.save).toHaveBeenCalledWith(booking);
      expect(holds.save).toHaveBeenCalledWith(hold);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('onHoldExpired (compensation, driven by the expiry job)', () => {
    it('loads the booking + its hold, releases the hold, and expires the booking', async () => {
      const hold = makeHold();
      const booking = makeBooking(hold.id);
      const releaseSpy = jest.spyOn(hold, 'release');
      const expireSpy = jest.spyOn(booking, 'expire');

      bookings.findById.mockResolvedValue(booking);
      holds.findById.mockResolvedValue(hold);

      await saga.onHoldExpired(booking.id);

      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(holds.findById).toHaveBeenCalledWith(hold.id);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
      expect(expireSpy).toHaveBeenCalledTimes(1);
      expect(bookings.save).toHaveBeenCalledWith(booking);
      expect(holds.save).toHaveBeenCalledWith(hold);
    });
  });
});
