import type {
  Listing as ListingRow,
  ListingType as ListingTypeRow,
  ListingStatus as ListingStatusRow,
  Prisma,
} from '@prisma/client';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';

/**
 * Translates between the Prisma `listing` row and the `Listing` aggregate — the
 * ONLY place BC-2's write side crosses the Prisma↔domain boundary. Domain enum
 * values are identical to the DB enum values, so status/type are straight casts.
 *
 * `toPersistence` returns a Prisma create/update input rather than a full row: we
 * never write `id`/`createdAt` from the domain on update (they're immutable), and
 * the repository decides create-vs-update via `upsert`.
 */
export class ListingMapper {
  static toDomain(row: ListingRow): Listing {
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
