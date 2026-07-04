import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ListingDetail,
  ListingSearchQuery,
  ListingSummary,
} from '@harbourstay/shared';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ListingQueryPort } from '@/catalog/application/ports/listing.query.port';

/**
 * CQRS read impl for BC-5. Projects Prisma rows DIRECTLY into contract Read
 * Model DTOs — no mapper, no aggregate, no reconstitution. Prisma lives only
 * here (infra). Every query hard-filters `status = Published`.
 */
@Injectable()
export class ListingQuery extends ListingQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async search(query: ListingSearchQuery): Promise<ListingSummary[]> {
    const where: Prisma.ListingWhereInput = {
      status: 'Published',
    };
    if (query.location) {
      where.location = { contains: query.location, mode: 'insensitive' };
    }
    if (query.guests !== undefined) {
      where.capacity = { gte: query.guests };
    }

    const rows = await this.prisma.listing.findMany({
      where,
      // Deterministic ordering keeps search cards stable across requests.
      orderBy: [{ basePrice: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        location: true,
        basePrice: true,
        images: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      location: row.location,
      basePrice: row.basePrice,
      thumbnailUrl: row.images[0] ?? null,
    }));
  }

  async getDetail(
    id: string,
    dates?: Pick<ListingSearchQuery, 'from' | 'to'>,
  ): Promise<ListingDetail | null> {
    const row = await this.prisma.listing.findFirst({
      where: { id, status: 'Published' },
      select: {
        id: true,
        title: true,
        location: true,
        basePrice: true,
        description: true,
        capacity: true,
        type: true,
        images: true,
      },
    });
    if (!row) {
      return null;
    }

    const detail: ListingDetail = {
      id: row.id,
      title: row.title,
      location: row.location,
      basePrice: row.basePrice,
      thumbnailUrl: row.images[0] ?? null,
      description: row.description,
      capacity: row.capacity,
      type: row.type,
      images: row.images,
    };

    if (dates?.from && dates?.to) {
      detail.indicativeAvailable = await this.computeIndicativeAvailable(
        id,
        dates.from,
        dates.to,
      );
    }

    return detail;
  }

  /**
   * Approximate availability hint (NOT a guarantee — re-verified at booking in
   * S3, no locking here): the range looks bookable unless it overlaps a
   * host-blocked AvailabilityBlock. Overlap is `[from, to) && [checkIn, checkOut)`.
   */
  private async computeIndicativeAvailable(
    listingId: string,
    from: string,
    to: string,
  ): Promise<boolean> {
    const overlappingBlocked = await this.prisma.availabilityBlock.count({
      where: {
        listingId,
        isBlocked: true,
        checkIn: { lt: new Date(`${to}T00:00:00.000Z`) },
        checkOut: { gt: new Date(`${from}T00:00:00.000Z`) },
      },
    });
    return overlappingBlocked === 0;
  }
}
