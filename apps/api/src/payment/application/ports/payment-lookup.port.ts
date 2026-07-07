/** What the saga needs to drive the checkout: the ids to load + the amount. */
export interface PaymentLookupResult {
  /** The booking this payment belongs to (→ BC-1). */
  bookingId: string;
  /** The hold that booking claims (→ BC-2), denormalized for the saga. */
  holdId: string;
  /** The paid amount in minor units (cents), for cross-checking if desired. */
  amount: number;
}

/**
 * Read port (owned by BC-3, used by `BookingCheckoutSaga`) resolving a paymentId
 * to the ids the saga must act on. Impl projects Payment ⋈ Booking rows directly
 * (no aggregate reconstitution) — a CQRS read on the write path's behalf. Returns
 * `null` if the payment is unknown.
 */
export abstract class PaymentLookupPort {
  abstract lookup(paymentId: string): Promise<PaymentLookupResult | null>;
}
