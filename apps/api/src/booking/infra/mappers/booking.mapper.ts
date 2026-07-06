import type {
  Booking as BookingRow,
  BookingStatus as BookingStatusRow,
} from '@prisma/client';
import { Booking } from '@/booking/domain/models/booking.model';
import { DateRange } from '@/booking/domain/vo/date-range.vo';
import { PartySize } from '@/booking/domain/vo/party-size.vo';
import { Money } from '@/booking/domain/vo/money.vo';
import { BookingStatus } from '@/booking/domain/enums/booking-status.enum';

/**
 * Translates between the Prisma `booking` row and the `Booking` aggregate. The
 * ONLY place BC-1's write side crosses the Prisma↔domain boundary. Domain enum
 * values match the DB enum (same strings), so status is a straight cast. Currency
 * is not stored per-row (MVP is single-currency USD) — restored as USD.
 */
export class BookingMapper {
  static toDomain(row: BookingRow): Booking {
    return Booking.reconstitute({
      id: row.id,
      guestId: row.guestId,
      listingId: row.listingId,
      holdId: row.holdId,
      dateRange: DateRange.reconstitute(row.checkIn, row.checkOut),
      partySize: PartySize.create(row.partySize),
      status: row.status as unknown as BookingStatus,
      priceSnapshot: Money.reconstitute(row.priceSnapshot, 'USD'),
      holdExpiresAt: row.holdExpiresAt,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(booking: Booking): BookingRow {
    return {
      id: booking.id,
      guestId: booking.guestId,
      listingId: booking.listingId,
      holdId: booking.holdId,
      checkIn: booking.dateRange.checkIn,
      checkOut: booking.dateRange.checkOut,
      partySize: booking.partySize.value,
      status: booking.status as unknown as BookingStatusRow,
      priceSnapshot: booking.priceSnapshot.amount,
      holdExpiresAt: booking.holdExpiresAt,
      createdAt: booking.createdAt,
    };
  }
}
