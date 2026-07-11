import { DomainException } from '@/shared/exceptions/domain.exception';
import type { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';

/**
 * Raised when a `Listing` publication transition is attempted from a status that
 * does not allow it — e.g. publishing an already-Published listing, or
 * unpublishing one that is already Unpublished. Mapped to `409 Conflict`.
 *
 * We GUARD these transitions (throw) rather than treating a re-publish as a
 * silent no-op. Rationale: it matches every other state machine in this codebase
 * (`Hold`, `Booking`, `Payment` all throw on an illegal move), and a redundant
 * publish is almost always a client bug worth surfacing rather than swallowing.
 * (`Payment` is the deliberate exception — its transitions are idempotent because
 * Stripe delivers webhooks at-least-once; a host clicking "Publish" has no such
 * excuse.)
 */
export class InvalidListingStateException extends DomainException {
  readonly code = 'INVALID_LISTING_STATE';

  constructor(from: ListingStatus, attempted: string) {
    super(`Cannot ${attempted} a listing in '${from}' state`);
  }
}
