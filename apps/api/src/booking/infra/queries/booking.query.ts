import { Injectable } from '@nestjs/common';
import type { BookingStatus, BookingSummary } from '@harbourstay/shared';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { BookingQueryPort } from '@/booking/application/ports/booking.query.port';

/** Format a `@db.Date` (UTC-midnight) as the contract's `YYYY-MM-DD`. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * CQRS read impl for BC-1. Projects a Prisma `booking` row DIRECTLY into the
 * `bookingSummary` contract DTO — no mapper, no aggregate, no reconstitution.
 * Prisma lives only here. `priceSnapshot` is emitted in minor units (cents) and
 * `holdExpiresAt` as an ISO-8601 timestamp — identical to the `POST /bookings`
 * response projection.
 *
 * Ownership is enforced in the WHERE clause: a booking not owned by `guestId`
 * simply isn't found, so the caller cannot distinguish "not yours" from "doesn't
 * exist" (both → 404).
 */
@Injectable()
export class BookingQuery extends BookingQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByIdForGuest(
    id: string,
    guestId: string,
  ): Promise<BookingSummary | null> {
    const row = await this.prisma.booking.findFirst({
      where: { id, guestId },
      select: {
        id: true,
        listingId: true,
        status: true,
        checkIn: true,
        checkOut: true,
        partySize: true,
        priceSnapshot: true,
        holdExpiresAt: true,
      },
    });
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      listingId: row.listingId,
      status: row.status as BookingStatus,
      checkIn: toDateString(row.checkIn),
      checkOut: toDateString(row.checkOut),
      partySize: row.partySize,
      priceSnapshot: row.priceSnapshot,
      holdExpiresAt: row.holdExpiresAt.toISOString(),
    };
  }
}
