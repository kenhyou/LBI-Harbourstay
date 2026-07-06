import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { BookingSummary } from '@harbourstay/shared';
import { GetBookingQuery } from '@/booking/application/queries/get-booking.query';
import { BookingQueryPort } from '@/booking/application/ports/booking.query.port';

/**
 * CQRS read handler for `GET /bookings/:id`. Pure projection — delegates to the
 * ownership-scoped query port. Returns `null` when the booking is unknown OR
 * owned by a different guest; the presenter maps `null` → 404.
 */
@QueryHandler(GetBookingQuery)
export class GetBookingHandler
  implements IQueryHandler<GetBookingQuery, BookingSummary | null>
{
  constructor(private readonly bookings: BookingQueryPort) {}

  execute(query: GetBookingQuery): Promise<BookingSummary | null> {
    return this.bookings.findByIdForGuest(query.id, query.guestId);
  }
}
