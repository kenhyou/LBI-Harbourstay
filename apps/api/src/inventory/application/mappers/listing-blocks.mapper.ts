import type { AvailabilityBlock as AvailabilityBlockDto } from '@harbourstay/shared';
import type { Listing } from '@/inventory/domain/models/listing.model';
import type { AvailabilityBlock } from '@/inventory/domain/models/availability-block.model';

/** Format a UTC-midnight `Date` as the contract's `YYYY-MM-DD` calendar string. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** One block child entity → the `availabilityBlock` contract DTO. */
function toDto(block: AvailabilityBlock): AvailabilityBlockDto {
  return {
    id: block.id,
    checkIn: toDateString(block.range.checkIn),
    checkOut: toDateString(block.range.checkOut),
  };
}

/**
 * Projects a `Listing` aggregate's current blocks into the `listingBlocksResponse`
 * contract shape (an `availabilityBlock[]`). The block-write handlers return the
 * FULL list off the just-saved aggregate — the same "map from the in-memory write
 * model, don't re-read" choice `toHostListingSummary` makes — so the client
 * re-syncs its whole block list in one round trip after a POST/DELETE. Sorted by
 * check-in for a stable, calendar-ordered response.
 */
export function toListingBlocks(listing: Listing): AvailabilityBlockDto[] {
  return listing.blocks
    .map(toDto)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}
