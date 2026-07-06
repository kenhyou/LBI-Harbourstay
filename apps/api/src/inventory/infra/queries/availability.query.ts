import { Injectable } from '@nestjs/common';
import type {
  ListingAvailability,
  UnavailableRange,
} from '@harbourstay/shared';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AvailabilityQueryPort } from '@/inventory/application/ports/availability.query.port';

/** Format a `@db.Date` (UTC-midnight) as the contract's `YYYY-MM-DD`. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * CQRS read impl for BC-2 availability. Projects Prisma rows DIRECTLY into the
 * `ListingAvailability` contract DTO — no mapper, no aggregate. The taken ranges
 * are the union of active holds (`held`), committed holds (`booked`), and host
 * blocks (`blocked`) overlapping the `[from, to)` window. INDICATIVE only.
 */
@Injectable()
export class AvailabilityQuery extends AvailabilityQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getUnavailable(
    listingId: string,
    from: string,
    to: string,
  ): Promise<ListingAvailability> {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);

    const [holds, blocks] = await Promise.all([
      this.prisma.hold.findMany({
        where: {
          listingId,
          status: { in: ['active', 'committed'] },
          checkIn: { lt: toDate },
          checkOut: { gt: fromDate },
        },
        select: { checkIn: true, checkOut: true, status: true },
      }),
      this.prisma.availabilityBlock.findMany({
        where: {
          listingId,
          isBlocked: true,
          checkIn: { lt: toDate },
          checkOut: { gt: fromDate },
        },
        select: { checkIn: true, checkOut: true },
      }),
    ]);

    const unavailable: UnavailableRange[] = [
      ...holds.map((h) => ({
        checkIn: toDateString(h.checkIn),
        checkOut: toDateString(h.checkOut),
        reason: (h.status === 'committed' ? 'booked' : 'held') as
          | 'held'
          | 'booked',
      })),
      ...blocks.map((b) => ({
        checkIn: toDateString(b.checkIn),
        checkOut: toDateString(b.checkOut),
        reason: 'blocked' as const,
      })),
    ];

    return { listingId, unavailable };
  }
}
