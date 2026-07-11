import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { ListingMapper } from '@/inventory/infra/mappers/listing.mapper';
import { Listing } from '@/inventory/domain/models/listing.model';

/**
 * Prisma-backed write repository for the `Listing` aggregate (BC-2). Reads the
 * transactional client from `TransactionHost`, so a `save` inside a
 * `TransactionManagerPort.run` joins the ambient transaction. Prisma lives only
 * here — the application/domain never see it.
 *
 * `save` is an upsert: on create it inserts the full row; on update it writes back
 * only the mutable columns (never `id`/`hostId`/`createdAt`, which are immutable
 * post-creation). That mirrors how the domain treats them (no setters).
 *
 * S6b adds the block child collection. The aggregate holds the DESIRED set of
 * blocks (each an id + range); `save` diffs it against the persisted `isBlocked`
 * rows and inserts the new ones / deletes the removed ones — all on the ambient
 * transactional client, so the listing write and the block writes commit together.
 */
@Injectable()
export class ListingRepository extends ListingRepositoryPort {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>,
  ) {
    super();
  }

  async save(listing: Listing): Promise<void> {
    const data = ListingMapper.toPersistence(listing);
    await this.txHost.tx.listing.upsert({
      where: { id: data.id },
      create: data,
      update: {
        title: data.title,
        description: data.description,
        type: data.type,
        location: data.location,
        capacity: data.capacity,
        basePrice: data.basePrice,
        images: data.images,
        status: data.status,
      },
    });

    await this.syncBlocks(listing);
  }

  async findById(id: string): Promise<Listing | null> {
    const row = await this.txHost.tx.listing.findUnique({
      where: { id },
      // Only the host-set blocks join the aggregate — the availability calendar's
      // non-block rows (holds/bookings) are a different concern, read elsewhere.
      include: { availabilityBlocks: { where: { isBlocked: true } } },
    });
    return row ? ListingMapper.toDomain(row) : null;
  }

  /**
   * Reconcile the persisted `isBlocked` rows for this listing with the aggregate's
   * current blocks: INSERT blocks the aggregate has but the DB doesn't, DELETE rows
   * the DB has but the aggregate no longer does. Diffing by the block id (which the
   * aggregate mints and preserves across reconstitute) keeps this idempotent — a
   * save that changed no blocks writes nothing.
   */
  private async syncBlocks(listing: Listing): Promise<void> {
    const tx = this.txHost.tx;
    const desired = listing.blocks;
    const desiredIds = new Set(desired.map((b) => b.id));

    const existing = await tx.availabilityBlock.findMany({
      where: { listingId: listing.id, isBlocked: true },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((r) => r.id));

    const toInsert = desired.filter((b) => !existingIds.has(b.id));
    const toDeleteIds = existing
      .filter((r) => !desiredIds.has(r.id))
      .map((r) => r.id);

    if (toInsert.length > 0) {
      await tx.availabilityBlock.createMany({
        data: toInsert.map((b) => ({
          id: b.id,
          listingId: listing.id,
          checkIn: b.range.checkIn,
          checkOut: b.range.checkOut,
          isBlocked: true,
        })),
      });
    }

    if (toDeleteIds.length > 0) {
      await tx.availabilityBlock.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
    }
  }
}
