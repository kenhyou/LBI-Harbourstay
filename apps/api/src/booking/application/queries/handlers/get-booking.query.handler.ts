import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { BookingDetail } from '@harbourstay/shared';
import { GetBookingQuery } from '@/booking/application/queries/get-booking.query';
import { BookingQueryPort } from '@/booking/application/ports/booking.query.port';

/**
 * CQRS read handler for `GET /bookings/:id`. Pure projection — delegates to the
 * ownership-scoped query port, returning the full `bookingDetail` read model.
 * Returns `null` when the booking is unknown OR owned by a different guest; the
 * presenter maps `null` → 404.
 */
@QueryHandler(GetBookingQuery)
export class GetBookingHandler
  implements IQueryHandler<GetBookingQuery, BookingDetail | null>
{
  constructor(private readonly bookings: BookingQueryPort) {}

  execute(query: GetBookingQuery): Promise<BookingDetail | null> {
    return this.bookings.findDetailByIdForGuest(query.id, query.guestId);
  }
}
