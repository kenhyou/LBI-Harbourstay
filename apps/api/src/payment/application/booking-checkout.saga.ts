import { Injectable } from '@nestjs/common';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { OutboxPort } from '@/shared/outbox/outbox.port';
import { PaymentLookupPort } from '@/payment/application/ports/payment-lookup.port';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { BOOKING_CONFIRMED } from '@/booking/domain/events/booking-confirmed.event';
import { PaymentNotFoundException } from '@/payment/domain/exceptions/payment-not-found.exception';
import { BookingNotFoundException } from '@/booking/domain/exceptions/booking-not-found.exception';
import { HoldNotFoundException } from '@/inventory/domain/exceptions/hold-not-found.exception';

/**
 * KEN'S FILL FILE — stub. `BookingCheckoutSaga` — the process manager (application
 * layer, NOT an aggregate) that coordinates the three Core BCs across the payment
 * round-trip. Each step has a compensating action. Your spec is
 * `booking-checkout.saga.spec.ts` (ports mocked) — implement the decision logic to
 * make it green.
 *
 * Design intent: keep these methods framework-light and testable — orchestration
 * only (load → call domain method → save → enqueue), no business `if`s beyond the
 * cross-aggregate coordination. The webhook handler marks the Payment and publishes
 * an in-process event; a thin `@EventsHandler` calls the matching method here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PORTS YOU CALL (already injected below) — exact signatures:
 *
 *   this.tx.run(work: () => Promise<T>): Promise<T>
 *       // wrap the whole unit of work in ONE transaction (commit on resolve).
 *
 *   this.lookup.lookup(paymentId: string):
 *       Promise<{ bookingId: string; holdId: string; amount: number } | null>
 *
 *   this.bookings.findById(id: string): Promise<Booking | null>
 *   this.bookings.save(booking: Booking): Promise<void>
 *       // Booking domain methods you'll call: booking.confirm(), booking.expire()
 *       //   plus getters booking.holdId / booking.guestId / booking.listingId /
 *       //   booking.dateRange / booking.priceSnapshot for the outbox payload.
 *
 *   this.holds.findById(id: string): Promise<Hold | null>
 *   this.holds.save(hold: Hold): Promise<void>
 *       // Hold domain methods you'll call: hold.commit(), hold.release()
 *
 *   this.outbox.enqueue(type: string, aggregateId: string,
 *                       payload: Record<string, unknown>): Promise<void>
 *       // Use the constant BOOKING_CONFIRMED and the BookingConfirmedPayload shape
 *       // from '@/booking/domain/events/booking-confirmed.event' — import them when
 *       // you implement onPaymentSucceeded. enqueue MUST be called inside tx.run so
 *       // the outbox row commits atomically with booking.confirm()/hold.commit().
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class BookingCheckoutSaga {
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly lookup: PaymentLookupPort,
    private readonly bookings: BookingRepositoryPort,
    private readonly holds: HoldRepositoryPort,
    private readonly outbox: OutboxPort,
  ) {}

  /**
   * On `PaymentSucceeded` — CONFIRM path. In ONE transaction (`this.tx.run`):
   *   1. lookup(paymentId) → { bookingId, holdId }  (null → nothing to do / throw)
   *   2. load the Booking (bookingId) and the Hold (holdId)
   *   3. booking.confirm()  and  hold.commit()
   *   4. save both
   *   5. outbox.enqueue(BOOKING_CONFIRMED, booking.id, payload) — SAME txn
   * This txn is SEPARATE from the payment/webhook txn (eventual consistency — never
   * hold a DB lock across the Stripe round-trip).
   */
  async onPaymentSucceeded(paymentId: string): Promise<void> {
    return this.tx.run(async () => {
      const payment = await this.lookup.lookup(paymentId);

      if (!payment) {
        throw new PaymentNotFoundException(paymentId);
      }

      const bookingId = payment.bookingId;
      const holdId = payment.holdId;

      const booking = await this.bookings.findById(bookingId);
      if (!booking) {
        throw new BookingNotFoundException(bookingId);
      }

      const hold = await this.holds.findById(holdId);
      if (!hold) {
        throw new HoldNotFoundException(holdId);
      }

      booking.confirm();
      hold.commit();

      await this.bookings.save(booking);
      await this.holds.save(hold);

      await this.outbox.enqueue(BOOKING_CONFIRMED, booking.id, {
        bookingId,
        guestId: booking.guestId,
        listingId: booking.listingId,
        checkIn: booking.dateRange.checkIn.toISOString().slice(0, 10),
        checkOut: booking.dateRange.checkOut.toISOString().slice(0, 10),
        priceSnapshot: booking.priceSnapshot.amount,
      });
    });
  }

  /**
   * On `PaymentFailed` — COMPENSATE. In ONE transaction:
   *   lookup → load Booking + Hold → hold.release() + booking.expire() → save both.
   * No outbox row (nothing to notify). Order the guards so a failed compensation
   * rolls the whole txn back.
   */
  async onPaymentFailed(paymentId: string): Promise<void> {
    return this.tx.run(async () => {
      const payment = await this.lookup.lookup(paymentId);

      if (!payment) {
        throw new PaymentNotFoundException(paymentId);
      }

      const bookingId = payment.bookingId;
      const holdId = payment.holdId;

      const booking = await this.bookings.findById(bookingId);
      if (!booking) {
        throw new BookingNotFoundException(bookingId);
      }

      const hold = await this.holds.findById(holdId);
      if (!hold) {
        throw new HoldNotFoundException(holdId);
      }

      booking.expire();
      hold.release();

      await this.bookings.save(booking);
      await this.holds.save(hold);
    });
  }

  /**
   * On Hold-TTL expiry (scheduled job) — same COMPENSATION, keyed by bookingId:
   *   load the Booking (bookingId) → load its Hold (booking.holdId) →
   *   hold.release() + booking.expire() → save both, in ONE transaction.
   * This is the safety net that bounds the eventual-consistency window.
   */
  async onHoldExpired(bookingId: string): Promise<void> {
    return this.tx.run(async () => {
      const booking = await this.bookings.findById(bookingId);
      if (!booking) {
        throw new BookingNotFoundException(bookingId);
      }

      const hold = await this.holds.findById(booking.holdId);
      if (!hold) {
        throw new HoldNotFoundException(booking.holdId);
      }

      booking.expire();
      hold.release();

      await this.bookings.save(booking);
      await this.holds.save(hold);
    });
  }
}
