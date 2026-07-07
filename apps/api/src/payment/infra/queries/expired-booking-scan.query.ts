import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ExpiredBookingScanPort } from '@/payment/application/ports/expired-booking-scan.port';

/**
 * Read impl of `ExpiredBookingScanPort` (BC-3). Finds bookings still in
 * `PendingPayment` whose `active` hold has passed its TTL. Joins booking ⋈ hold on
 * `booking.holdId`; returns only the booking ids for the expiry job to compensate.
 */
@Injectable()
export class ExpiredBookingScanQuery extends ExpiredBookingScanPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findExpiredPendingBookingIds(now: Date): Promise<string[]> {
    // No Prisma relation across the aggregate boundary (holdId is a plain string),
    // so join in two steps: expired active holds → still-pending bookings.
    const expiredHolds = await this.prisma.hold.findMany({
      where: { status: 'active', expiresAt: { lt: now } },
      select: { id: true },
    });
    if (expiredHolds.length === 0) {
      return [];
    }
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'PendingPayment',
        holdId: { in: expiredHolds.map((h) => h.id) },
      },
      select: { id: true },
    });
    return bookings.map((b) => b.id);
  }
}
