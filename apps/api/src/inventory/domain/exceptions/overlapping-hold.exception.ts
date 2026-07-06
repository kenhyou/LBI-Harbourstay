import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * THE overbooking guard, surfaced. Raised by `HoldRepository` when a Hold insert
 * violates the Postgres `no_overlapping_holds` EXCLUDE constraint (SQLSTATE
 * `23P01`) — i.e. another active/committed hold already covers overlapping dates
 * on the same listing. The HTTP layer maps it to `409 Conflict`. This is the
 * exception that proves the concurrency invariant held. See ADR-0007.
 */
export class OverlappingHoldException extends DomainException {
  readonly code = 'OVERLAPPING_HOLD';

  constructor(listingId: string) {
    super(`Dates overlap an existing hold on listing ${listingId}`);
  }
}
