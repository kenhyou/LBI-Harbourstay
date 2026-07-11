import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised by `Listing.block()` when the requested range overlaps a block the host
 * has ALREADY set on the same listing (half-open overlap). Distinct from
 * `OverlappingHoldException` (a guest's hold, enforced by the DB EXCLUDE) and
 * from `DatesNotAvailableException` (a guest hitting a block at booking time):
 * this is the HOST colliding with their own existing block while managing the
 * calendar. Mapped to `409 Conflict`.
 */
export class OverlappingBlockException extends DomainException {
  readonly code = 'OVERLAPPING_BLOCK';

  constructor(listingId: string) {
    super(
      `The requested range overlaps an existing block on listing ${listingId}`,
    );
  }
}
