import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import {
  ListingInventoryPort,
  type ListingInventorySnapshot,
} from '@/inventory/application/ports/listing-inventory.port';
import type { DateRange } from '@/inventory/domain/vo/date-range.vo';

/**
 * Prisma-backed read impl of `ListingInventoryPort`. Loads the lightweight
 * listing facts (capacity + base rate) and answers the host-block overlap check
 * for the Create-Booking flow. Prisma lives only here. Currency is fixed to USD
 * for MVP (the Listing row stores only the integer minor-unit base price).
 */
@Injectable()
export class ListingInventoryQuery extends ListingInventoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getSnapshot(
    listingId: string,
  ): Promise<ListingInventorySnapshot | null> {
    const row = await this.prisma.listing.findFirst({
      where: { id: listingId, status: 'Published' },
      select: { id: true, capacity: true, basePrice: true },
    });
    if (!row) {
      return null;
    }
    return {
      listingId: row.id,
      capacity: row.capacity,
      basePrice: row.basePrice,
      currency: 'USD',
    };
  }

  async hasBlockingBlock(
    listingId: string,
    range: DateRange,
  ): Promise<boolean> {
    // Half-open overlap against host-blocked ranges: block.checkIn < range.checkOut
    // AND block.checkOut > range.checkIn.
    const count = await this.prisma.availabilityBlock.count({
      where: {
        listingId,
        isBlocked: true,
        checkIn: { lt: range.checkOut },
        checkOut: { gt: range.checkIn },
      },
    });
    return count > 0;
  }
}
