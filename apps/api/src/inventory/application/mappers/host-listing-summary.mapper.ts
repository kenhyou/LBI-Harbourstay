import type {
  HostListingSummary,
  ListingStatus as ContractListingStatus,
  ListingType as ContractListingType,
} from '@harbourstay/shared';
import { Listing } from '@/inventory/domain/models/listing.model';

/**
 * Projects a `Listing` aggregate into the `hostListingSummary` contract DTO — the
 * response shape for create / update / publish / unpublish. We map from the SAVED
 * aggregate rather than re-reading through the query port: the write already holds
 * the fresh state in memory, so an extra round-trip would be wasted (the read path
 * is for the LIST endpoint, which genuinely bypasses the domain).
 *
 * The domain enums (`ListingType`/`ListingStatus`) and the contract enums share
 * identical string values by construction, so the crossing is a safe cast — the
 * one spot the domain's vocabulary is re-expressed as the transport vocabulary.
 */
export function toHostListingSummary(listing: Listing): HostListingSummary {
  return {
    id: listing.id,
    title: listing.title,
    location: listing.location,
    type: listing.type as unknown as ContractListingType,
    capacity: listing.capacity,
    basePrice: listing.basePrice,
    status: listing.status as unknown as ContractListingStatus,
    createdAt: listing.createdAt.toISOString(),
  };
}
