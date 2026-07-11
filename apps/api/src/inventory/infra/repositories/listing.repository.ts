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
  }

  async findById(id: string): Promise<Listing | null> {
    const row = await this.txHost.tx.listing.findUnique({ where: { id } });
    return row ? ListingMapper.toDomain(row) : null;
  }
}
