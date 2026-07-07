/** The booking facts BC-3 needs to open a payment: ownership + amount + state. */
export interface PayableBooking {
  bookingId: string;
  /** The owning guest — checked against the authenticated caller. */
  guestId: string;
  /** Amount to charge, in minor units (cents), from the frozen priceSnapshot. */
  amount: number;
  currency: string;
  /** Current booking status — only a `PendingPayment` booking is payable. */
  status: string;
}

/**
 * Read port (BC-3) projecting the `booking` row into the minimal shape the
 * Create-PaymentIntent handler needs — WITHOUT reconstituting the Booking
 * aggregate or coupling BC-3 to BC-1's write model. Returns `null` if unknown.
 */
export abstract class PaymentBookingQueryPort {
  abstract findPayableBooking(bookingId: string): Promise<PayableBooking | null>;
}
