/**
 * Read port (BC-3) for the scheduled hold-expiry job. Finds bookings still stuck
 * in `PendingPayment` whose `Active` hold has passed its TTL — the safety net that
 * bounds the eventual-consistency window. The job feeds each id to
 * `BookingCheckoutSaga.onHoldExpired`. Projects a join (booking ⋈ hold); no
 * aggregate reconstitution.
 */
export abstract class ExpiredBookingScanPort {
  /** Booking ids whose active hold expired before `now` and are still pending. */
  abstract findExpiredPendingBookingIds(now: Date): Promise<string[]>;
}
