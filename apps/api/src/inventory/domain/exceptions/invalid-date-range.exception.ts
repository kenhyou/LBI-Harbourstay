import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised by BC-2's `DateRange.create` when check-in is not strictly before
 * check-out (zero-night or inverted range). Mapped to `400 Bad Request`. (The
 * Booking BC has its own copy of this exception.)
 */
export class InvalidDateRangeException extends DomainException {
  readonly code = 'INVALID_DATE_RANGE';

  constructor(checkIn: Date, checkOut: Date) {
    super(
      `check-in must be strictly before check-out: ` +
        `${checkIn.toISOString()} .. ${checkOut.toISOString()}`,
    );
  }
}
