import { DomainException } from '@/shared/exceptions/domain.exception';
import type { BookingStatus } from '@/booking/domain/enums/booking-status.enum';

/**
 * KEN'S FILL FILE — stub. Raised when a `Booking` transition is attempted from a
 * status that does not allow it (e.g. `complete()` on a PendingPayment booking).
 * The HTTP filter maps it to `409 Conflict`.
 *
 * TODO(you): call `super(...)` with a helpful message (e.g.
 * `Cannot ${attempted} a booking in '${from}' state`) and delete the throw.
 * Keep the `code` — the filter branches on it.
 */
export class InvalidBookingStateException extends DomainException {
  readonly code = 'INVALID_BOOKING_STATE';

  constructor(from: BookingStatus, attempted: string) {
    super(`Cannot transit to ${attempted} from ${from}`);
  }
}
