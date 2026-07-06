import type { ListingAvailability } from '@harbourstay/shared';

/**
 * Read-side (CQRS) port for BC-2 availability. Projects Prisma rows DIRECTLY into
 * the shared `ListingAvailability` contract DTO — no domain aggregate, no
 * reconstitution. Bound to `AvailabilityQuery` (infra) in exactly one module.
 */
export abstract class AvailabilityQueryPort {
  /**
   * The taken ranges in `[from, to)` the calendar should disable: active holds
   * (`held`), committed holds (`booked`), and host blocks (`blocked`). INDICATIVE
   * — re-verified at booking time by the DB EXCLUDE.
   */
  abstract getUnavailable(
    listingId: string,
    from: string,
    to: string,
  ): Promise<ListingAvailability>;
}
