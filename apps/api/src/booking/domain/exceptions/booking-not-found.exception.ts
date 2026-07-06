import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * KEN'S FILL FILE — stub. Raised when a booking lookup by id finds nothing.
 * The HTTP filter maps it to `404 Not Found`.
 *
 * TODO(you): call `super(...)` with a message like `Booking not found: ${id}`
 * and delete the throw. Keep the `code`.
 */
export class BookingNotFoundException extends DomainException {
  readonly code = 'BOOKING_NOT_FOUND';

  constructor(id: string) {
    super(`Booking not found: ${id}`);
  }
}
