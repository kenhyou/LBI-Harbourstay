import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExpiredBookingScanPort } from '@/payment/application/ports/expired-booking-scan.port';
import { BookingCheckoutSaga } from '@/payment/application/booking-checkout.saga';

/** Sweep cadence — how often we look for expired holds (ms). */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Scheduled safety net closing S3's deferred hold-expiry. Finds bookings still in
 * `PendingPayment` whose `Active` hold has passed its TTL and drives the saga's
 * compensation for each (`Hold.release()` + `Booking.expire()`), bounding the
 * eventual-consistency window. Each id compensates independently — one failure
 * (logged) never blocks the rest.
 *
 * `sweep()` is public + returns a count so integration tests can trigger it
 * deterministically.
 */
@Injectable()
export class HoldExpiryJob {
  private readonly logger = new Logger(HoldExpiryJob.name);

  constructor(
    private readonly scan: ExpiredBookingScanPort,
    private readonly saga: BookingCheckoutSaga,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<number> {
    const bookingIds = await this.scan.findExpiredPendingBookingIds(new Date());
    for (const bookingId of bookingIds) {
      try {
        await this.saga.onHoldExpired(bookingId);
      } catch (error) {
        this.logger.warn(
          `Hold-expiry compensation failed for booking ${bookingId}: ${String(error)}`,
        );
      }
    }
    return bookingIds.length;
  }
}
