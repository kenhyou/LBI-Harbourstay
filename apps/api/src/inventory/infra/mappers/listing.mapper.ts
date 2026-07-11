import type {
  Listing as ListingRow,
  AvailabilityBlock as AvailabilityBlockRow,
  ListingType as ListingTypeRow,
  ListingStatus as ListingStatusRow,
  Prisma,
} from '@prisma/client';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';

/** A `listing` row plus the host-blocked `availability_block` rows to rehydrate. */
export type ListingRowWithBlocks = ListingRow & {
  availabilityBlocks: AvailabilityBlockRow[];
};

/**
 * Translates between the Prisma `listing` row and the `Listing` aggregate — the
 * ONLY place BC-2's write side crosses the Prisma↔domain boundary. Domain enum
 * values are identical to the DB enum values, so status/type are straight casts.
 *
 * `toPersistence` returns a Prisma create/update input rather than a full row: we
 * never write `id`/`createdAt` from the domain on update (they're immutable), and
 * the repository decides create-vs-update via `upsert`. Blocks are NOT part of the
 * listing row — the repository persists that child collection separately (see
 * `ListingRepository.save`), so `toPersistence` stays about the listing columns.
 */
export class ListingMapper {
  static toDomain(row: ListingRowWithBlocks): Listing {
    return Listing.reconstitute({
      id: row.id,
      hostId: row.hostId,
      title: row.title,
      description: row.description,
      type: row.type as unknown as ListingType,
      location: row.location,
      capacity: row.capacity,
      basePrice: row.basePrice,
      images: row.images,
      status: row.status as unknown as ListingStatus,
      createdAt: row.createdAt,
      // Only the host-set blocks (isBlocked filtered by the query) are rehydrated;
      // the aggregate re-checks overlap against exactly this set.
      blocks: row.availabilityBlocks.map((b) => ({
        id: b.id,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
      })),
    });
  }

  static toPersistence(listing: Listing): Prisma.ListingUncheckedCreateInput {
    return {
      id: listing.id,
      hostId: listing.hostId,
      title: listing.title,
      description: listing.description,
      type: listing.type as unknown as ListingTypeRow,
      location: listing.location,
      capacity: listing.capacity,
      basePrice: listing.basePrice,
      images: listing.images,
      status: listing.status as unknown as ListingStatusRow,
      createdAt: listing.createdAt,
    };
  }
}
