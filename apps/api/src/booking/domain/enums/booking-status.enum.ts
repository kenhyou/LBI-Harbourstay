/**
 * BC-1 Booking lifecycle status. Values match both the Postgres `BookingStatus`
 * enum and the shared contract `bookingStatus` (same strings), so the mapper and
 * the presenter DTO are straight casts.
 *
 * State graph (no state may be skipped):
 *   PendingPayment --confirm()--> Confirmed --complete()---> Completed
 *        |                            |
 *        |--expire()--> Expired       |--markNoShow()--> NoShow
 *        |--cancel()--> Cancelled     (Confirmed --cancel(policy)--> Cancelled)
 */
export enum BookingStatus {
  PendingPayment = 'PendingPayment',
  Confirmed = 'Confirmed',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
  Expired = 'Expired',
  NoShow = 'NoShow',
}
