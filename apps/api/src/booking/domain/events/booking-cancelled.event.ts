/**
 * Domain event (BC-1) — a booking was cancelled by the guest within policy.
 * Emitted by the Cancel-Booking command handler into the Transactional Outbox
 * (row type `BOOKING_CANCELLED`), then relayed to Notifications. The payload is
 * PRIMITIVES ONLY — it serializes into the outbox row and crosses the BC boundary;
 * no VOs.
 *
 * `refundAmount` is the COMPUTED refund in minor units (cents) — recorded/notified,
 * never issued to Stripe (refunds are out of scope, PRD §2/§6). Idempotency key
 * downstream is the outbox row id; the booking id is the correlation/aggregate id.
 */
export const BOOKING_CANCELLED = 'BookingCancelled';

/** Primitives-only payload written to the outbox for a `BookingCancelled` event. */
export interface BookingCancelledPayload {
  bookingId: string;
  guestId: string;
  listingId: string;
  cancelledAt: string; // ISO-8601 timestamp
  refundAmount: number; // minor units (cents)
  reason?: string; // optional free-text reason the guest gave
  [key: string]: unknown;
}
