import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised at booking time when the referenced listing does not exist (or is not
 * bookable). Mapped to `404 Not Found`.
 */
export class ListingNotFoundException extends DomainException {
  readonly code = 'LISTING_NOT_FOUND';

  constructor(listingId: string) {
    super(`Listing not found: ${listingId}`);
  }
}
