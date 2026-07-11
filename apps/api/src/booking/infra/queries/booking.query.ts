import { Injectable } from '@nestjs/common';
import type {
  BookingDetail,
  BookingStatus,
  HostBookingSummary,
} from '@harbourstay/shared';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { BookingQueryPort } from '@/booking/application/ports/booking.query.port';

/** The `booking` columns the detail projection needs, plus the joined listing title. */
const bookingSelect = {
  id: true,
  listingId: true,
  status: true,
  checkIn: true,
  checkOut: true,
  partySize: true,
  priceSnapshot: true,
  createdAt: true,
  cancelledAt: true,
  refundAmount: true,
} as const;

type BookingRow = {
  id: string;
  listingId: string;
  status: string;
  checkIn: Date;
  checkOut: Date;
  partySize: number;
  priceSnapshot: number;
  createdAt: Date;
  cancelledAt: Date | null;
  refundAmount: number | null;
};

/** Format a `@db.Date` (UTC-midnight) as the contract's `YYYY-MM-DD`. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole nights between two UTC-midnight calendar dates (≥ 1). */
function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
}

/**
 * CQRS read impl for BC-1. Projects a Prisma `booking` row (joined to its
 * `listing` for `listingTitle`) DIRECTLY into the `bookingDetail` contract DTO —
 * no mapper, no aggregate, no reconstitution. Prisma lives only here.
 *
 * Wire conventions match the rest of BC-1: money in minor units (cents), dates as
 * `YYYY-MM-DD`, timestamps as ISO-8601. `currency` is USD (MVP single-currency;
 * not stored per-row). `cancelledAt`/`refundAmount` pass straight through, null
 * unless the booking was cancelled.
 *
 * Ownership is enforced in the WHERE clause: a booking not owned by `guestId`
 * simply isn't found (both "not yours" and "doesn't exist" → 404). The list method
 * is scoped to the caller and returned newest-first.
 */
@Injectable()
export class BookingQuery extends BookingQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findDetailByIdForGuest(
    id: string,
    guestId: string,
  ): Promise<BookingDetail | null> {
    const row = await this.prisma.booking.findFirst({
      where: { id, guestId },
      select: bookingSelect,
    });
    if (!row) {
      return null;
    }
    const title = await this.listingTitle(row.listingId);
    return this.toDetail(row, title);
  }

  async listForGuest(guestId: string): Promise<BookingDetail[]> {
    const rows = await this.prisma.booking.findMany({
      where: { guestId },
      select: bookingSelect,
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length === 0) {
      return [];
    }

    // One extra query for all the listing titles, keyed by id (avoids N+1).
    const listingIds = [...new Set(rows.map((r) => r.listingId))];
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: listingIds } },
      select: { id: true, title: true },
    });
    const titleById = new Map(listings.map((l) => [l.id, l.title]));

    return rows.map((row) =>
      this.toDetail(row, titleById.get(row.listingId) ?? ''),
    );
  }

  async listForHost(hostId: string): Promise<HostBookingSummary[]> {
    // `booking.listingId` is a plain cross-aggregate reference (no Prisma relation),
    // so we scope by first resolving the host's listings, then reading the bookings
    // on exactly those. This IS the ownership gate: a booking on another host's
    // listing can never enter the `in` set.
    const listings = await this.prisma.listing.findMany({
      where: { hostId },
      select: { id: true, title: true },
    });
    if (listings.length === 0) {
      return [];
    }
    const titleById = new Map(listings.map((l) => [l.id, l.title]));

    const rows = await this.prisma.booking.findMany({
      where: { listingId: { in: [...titleById.keys()] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        listingId: true,
        guestId: true,
        checkIn: true,
        checkOut: true,
        partySize: true,
        status: true,
        priceSnapshot: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      listingTitle: titleById.get(row.listingId) ?? '',
      guestId: row.guestId,
      checkIn: toDateString(row.checkIn),
      checkOut: toDateString(row.checkOut),
      partySize: row.partySize,
      status: row.status as BookingStatus,
      totalPrice: row.priceSnapshot, // frozen all-in total, minor units
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** The listing's title, or '' if the listing row is gone (booking outlives it). */
  private async listingTitle(listingId: string): Promise<string> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { title: true },
    });
    return listing?.title ?? '';
  }

  private toDetail(row: BookingRow, listingTitle: string): BookingDetail {
    return {
      id: row.id,
      listingId: row.listingId,
      listingTitle,
      status: row.status as BookingStatus,
      checkIn: toDateString(row.checkIn),
      checkOut: toDateString(row.checkOut),
      nights: nightsBetween(row.checkIn, row.checkOut),
      partySize: row.partySize,
      priceSnapshot: row.priceSnapshot,
      currency: 'USD',
      createdAt: row.createdAt.toISOString(),
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      refundAmount: row.refundAmount,
    };
  }
}
