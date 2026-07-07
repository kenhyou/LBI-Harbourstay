/**
 * Domain event (BC-1) — a booking became `Confirmed` because its payment settled.
 * Emitted by the `BookingCheckoutSaga` into the Transactional Outbox (row type
 * `BOOKING_CONFIRMED`), then relayed to Notifications. The payload is PRIMITIVES
 * ONLY — it serializes into the outbox row and crosses the BC boundary; no VOs.
 *
 * Idempotency key downstream is the booking id (also the outbox `aggregateId`).
 */
export const BOOKING_CONFIRMED = 'BookingConfirmed';

/** Primitives-only payload written to the outbox for a `BookingConfirmed` event. */
export interface BookingConfirmedPayload {
  bookingId: string;
  guestId: string;
  listingId: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  priceSnapshot: number; // minor units (cents)
  [key: string]: unknown;
}
