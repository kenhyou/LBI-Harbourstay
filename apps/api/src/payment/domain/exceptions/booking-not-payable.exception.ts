import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised when `POST /bookings/:id/pay` targets a booking that is not in
 * `PendingPayment` (already confirmed, expired, or cancelled) — there is nothing
 * to pay for. Mapped to `409 Conflict`. (Scaffold — fully implemented; not a fill
 * file.)
 */
export class BookingNotPayableException extends DomainException {
  readonly code = 'BOOKING_NOT_PAYABLE';

  constructor(bookingId: string, status: string) {
    super(`Booking ${bookingId} is not payable (status: ${status})`);
  }
}
