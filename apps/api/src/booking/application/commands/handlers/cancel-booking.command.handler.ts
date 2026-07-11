import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { CancelBookingResponse } from '@harbourstay/shared';
import { CancelBookingCommand } from '@/booking/application/commands/cancel-booking.command';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { CancellationPolicyProviderPort } from '@/booking/application/ports/cancellation-policy.provider.port';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { OutboxPort } from '@/shared/outbox/outbox.port';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { HoldStatus } from '@/inventory/domain/enums/hold-status.enum';
import { BookingNotFoundException } from '@/booking/domain/exceptions/booking-not-found.exception';
import {
  BOOKING_CANCELLED,
  type BookingCancelledPayload,
} from '@/booking/domain/events/booking-cancelled.event';

/**
 * KEN'S FILL FILE — stub. `CancelBookingHandler` — the S5 saga-compensation shape
 * seen from the OTHER direction: a guest cancels their booking, and (if a hold is
 * still standing) the hold is released and a `BookingCancelled` outbox event is
 * enqueued — all in ONE transaction. Your spec is
 * `cancel-booking.command.handler.spec.ts` (ports mocked) — implement `execute` to
 * make it green; do not weaken the spec.
 *
 * Design intent: orchestration only (load → verify ownership → evaluate policy →
 * call domain method → save → enqueue). No business `if`s beyond the ownership
 * gate and the cross-aggregate coordination. Refunds are COMPUTED by the policy and
 * RECORDED on the booking — never issued to Stripe (out of scope, PRD §2/§6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PORTS YOU CALL (already injected below) — exact signatures:
 *
 *   this.tx.run(work: () => Promise<T>): Promise<T>
 *       // wrap the WHOLE unit of work in ONE transaction (commit on resolve).
 *       // Everything below — cancel, hold.release, saves, outbox.enqueue — MUST
 *       // happen INSIDE this callback so it all commits atomically.
 *
 *   this.bookings.findById(id): Promise<Booking | null>
 *   this.bookings.save(booking): Promise<void>
 *       // Booking domain method: booking.cancel(outcome, now)
 *       // getters: booking.guestId / booking.listingId / booking.holdId /
 *       //   booking.status / booking.dateRange / booking.priceSnapshot /
 *       //   booking.cancelledAt / booking.refundAmount
 *
 *   this.policies.forListing(listingId): Promise<CancellationPolicy>
 *       // policy.evaluate(status, checkIn, now, priceSnapshotMinorUnits): CancellationOutcome
 *
 *   this.holds.findById(id): Promise<Hold | null>
 *   this.holds.save(hold): Promise<void>
 *       // Hold domain method: hold.release()  (Active|Committed → Released)
 *
 *   this.outbox.enqueue(type, aggregateId, payload): Promise<void>
 *       // Use BOOKING_CANCELLED + the BookingCancelledPayload shape (imported
 *       // above). enqueue MUST be called inside tx.run.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Suggested flow for `execute(command)`:
 *   1. load booking by command.bookingId; if null OR booking.guestId !==
 *      command.guestId → throw `new BookingNotFoundException(command.bookingId)`
 *      (404 no-leak: "not yours" is indistinguishable from "doesn't exist").
 *      Do this OUTSIDE or at the top of the txn — but never reveal ownership.
 *   2. resolve the policy (this.policies.forListing(booking.listingId)) and
 *      evaluate it against booking.status / booking.dateRange.checkIn / a `now`
 *      you capture once / booking.priceSnapshot.amount.
 *   3. in this.tx.run(async () => { ... }):
 *        booking.cancel(outcome, now)          // throws if the policy forbids it
 *        load the hold (booking.holdId); if it exists AND is still releasable,
 *          hold.release() and this.holds.save(hold)
 *        this.bookings.save(booking)
 *        this.outbox.enqueue(BOOKING_CANCELLED, booking.id, payload)
 *   4. return the CancelBookingResponse: { id, status, cancelledAt (ISO),
 *      refundAmount (minor units) } read back off the cancelled booking.
 */
@CommandHandler(CancelBookingCommand)
export class CancelBookingHandler
  implements ICommandHandler<CancelBookingCommand, CancelBookingResponse>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly bookings: BookingRepositoryPort,
    private readonly holds: HoldRepositoryPort,
    private readonly policies: CancellationPolicyProviderPort,
    private readonly outbox: OutboxPort,
  ) {}

  async execute(command: CancelBookingCommand): Promise<CancelBookingResponse> {
    // Ownership gate — OUTSIDE the transaction (a read that may 404 needn't hold a
    // txn open). 404-no-leak: "not yours" is indistinguishable from "unknown".
    const booking = await this.bookings.findById(command.bookingId);
    if (!booking || booking.guestId !== command.guestId) {
      throw new BookingNotFoundException(command.bookingId);
    }

    // One `now` for both the policy decision and what the aggregate records —
    // they must agree on a single instant.
    const now = new Date();
    const policy = await this.policies.forListing(booking.listingId);
    const outcome = policy.evaluate(
      booking.status,
      booking.dateRange.checkIn,
      now,
      booking.priceSnapshot.amount,
    );

    // Compensation, in ONE transaction: cancel the booking, release its hold, and
    // enqueue the BookingCancelled outbox row — all commit together or not at all.
    return this.tx.run(async () => {
      booking.cancel(outcome, now); // throws InvalidBookingStateException if forbidden

      // Release the hold only if it's still releasable. A PendingPayment booking's
      // hold TTL can elapse (hold → Expired/Released) before the booking-expiry job
      // runs; calling release() then throws and would roll back a legitimate cancel.
      const hold = await this.holds.findById(booking.holdId);
      if (
        hold &&
        (hold.status === HoldStatus.Active ||
          hold.status === HoldStatus.Committed)
      ) {
        hold.release();
        await this.holds.save(hold);
      }

      await this.bookings.save(booking);

      const cancelledAtIso = now.toISOString();
      const payload: BookingCancelledPayload = {
        bookingId: booking.id,
        guestId: booking.guestId,
        listingId: booking.listingId,
        cancelledAt: cancelledAtIso,
        refundAmount: outcome.refundAmount,
        ...(command.reason ? { reason: command.reason } : {}),
      };
      await this.outbox.enqueue(BOOKING_CANCELLED, booking.id, payload);

      return {
        id: booking.id,
        status: booking.status,
        cancelledAt: cancelledAtIso,
        refundAmount: outcome.refundAmount,
      };
    });
  }
}
