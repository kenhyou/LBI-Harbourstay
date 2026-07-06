import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised at hold-placement when the requested range overlaps a host-set
 * `AvailabilityBlock` (isBlocked). Distinct from `OverlappingHoldException`
 * (which is another guest's hold): this is the host having taken the dates off
 * the market. Mapped to `409 Conflict`.
 */
export class DatesNotAvailableException extends DomainException {
  readonly code = 'DATES_NOT_AVAILABLE';

  constructor(listingId: string) {
    super(`Dates are blocked (unavailable) on listing ${listingId}`);
  }
}
