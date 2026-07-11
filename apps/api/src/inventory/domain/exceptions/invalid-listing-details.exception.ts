import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised when a listing's descriptive details violate an invariant the aggregate
 * owns — an empty title, or a capacity below 1. It is one exception with a
 * human-readable reason rather than one class per field: these are all "the
 * listing details you gave are not acceptable" failures, and the HTTP layer maps
 * them identically (→ 422 Unprocessable Entity).
 *
 * In practice the shared Zod contract (`hostListingUpsert`) already rejects an
 * empty title / capacity < 1 at the presenter boundary (→ 400), so this is
 * defence-in-depth: the aggregate protects its OWN invariants regardless of who
 * calls it (a future internal caller, a test, a seed script) — it never trusts
 * that validation happened upstream.
 */
export class InvalidListingDetailsException extends DomainException {
  readonly code = 'INVALID_LISTING_DETAILS';

  constructor(reason: string) {
    super(`Invalid listing details: ${reason}`);
  }
}
