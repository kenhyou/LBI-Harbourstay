import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { MyBookingsResponse } from '@harbourstay/shared';
import { MyBookingsQuery } from '@/booking/application/queries/my-bookings.query';
import { BookingQueryPort } from '@/booking/application/ports/booking.query.port';

/**
 * CQRS read handler for `GET /me/bookings`. Pure projection — delegates to the
 * guest-scoped query port, returning the current guest's bookings (newest first)
 * as `bookingDetail[]`. Bypasses the domain entirely.
 */
@QueryHandler(MyBookingsQuery)
export class MyBookingsHandler
  implements IQueryHandler<MyBookingsQuery, MyBookingsResponse>
{
  constructor(private readonly bookings: BookingQueryPort) {}

  execute(query: MyBookingsQuery): Promise<MyBookingsResponse> {
    return this.bookings.listForGuest(query.guestId);
  }
}
