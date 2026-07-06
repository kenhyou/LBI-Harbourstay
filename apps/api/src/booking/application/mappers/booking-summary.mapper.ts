import type { BookingSummary } from '@harbourstay/shared';
import type { Booking } from '@/booking/domain/models/booking.model';

/** Format a domain `Date` (calendar day) as the contract's `YYYY-MM-DD`. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Projects a `Booking` aggregate into the shared `bookingSummary` contract DTO
 * returned by `POST /bookings`. `priceSnapshot` is emitted in minor units
 * (cents); `holdExpiresAt` as an ISO-8601 timestamp for the TTL countdown.
 */
export function toBookingSummary(booking: Booking): BookingSummary {
  return {
    id: booking.id,
    listingId: booking.listingId,
    status: booking.status,
    checkIn: toDateString(booking.dateRange.checkIn),
    checkOut: toDateString(booking.dateRange.checkOut),
    partySize: booking.partySize.value,
    priceSnapshot: booking.priceSnapshot.amount,
    holdExpiresAt: booking.holdExpiresAt.toISOString(),
  };
}
