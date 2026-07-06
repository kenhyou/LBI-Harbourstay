import { DateRange } from '@/inventory/domain/vo/date-range.vo';

/**
 * The minimal Listing facts the booking flow needs cross-aggregate at hold time:
 * capacity (for the party-size check) and the base rate (for pricing). Loaded
 * without reconstituting the full `Listing` aggregate — a lightweight read.
 */
export interface ListingInventorySnapshot {
  listingId: string;
  capacity: number;
  /** Per-night base rate in minor units. */
  basePrice: number;
  currency: string;
}

/**
 * BC-2 read port over the canonical Listing rows, used by the Create-Booking
 * orchestration to (a) load capacity + rate and (b) check host-blocked dates. A
 * within-BC application port, so it may speak the `DateRange` VO directly.
 */
export abstract class ListingInventoryPort {
  /** Listing capacity + base rate, or `null` if the listing does not exist. */
  abstract getSnapshot(
    listingId: string,
  ): Promise<ListingInventorySnapshot | null>;

  /** True if `range` overlaps any host-set `AvailabilityBlock` (isBlocked). */
  abstract hasBlockingBlock(
    listingId: string,
    range: DateRange,
  ): Promise<boolean>;
}
