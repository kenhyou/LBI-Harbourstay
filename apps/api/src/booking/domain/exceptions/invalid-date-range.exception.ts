import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * KEN'S FILL FILE — stub. Raised by Booking's `DateRange.create` when check-in is
 * not strictly before check-out. The HTTP filter maps it to `400 Bad Request`.
 * (BC-2 keeps its own separate copy of this exception — no shared kernel.)
 *
 * TODO(you): call `super(...)` with a message describing the bad range and delete
 * the throw. Keep the `code`.
 */
export class InvalidDateRangeException extends DomainException {
  readonly code = 'INVALID_DATE_RANGE';

  constructor(checkIn: Date, checkOut: Date) {
    super(
      `Invalid date range: check-in ${checkIn} must be before check-out ${checkOut}`,
    );
  }
}
