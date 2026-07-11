import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { HostBookingsResponse } from '@harbourstay/shared';
import { HostBookingsQuery } from '@/booking/application/queries/host-bookings.query';
import { BookingQueryPort } from '@/booking/application/ports/booking.query.port';

/**
 * CQRS read handler for `GET /host/bookings`. Pure projection — delegates to the
 * host-scoped query port and returns the host's cross-listing bookings (newest
 * first). Bypasses the domain entirely (like S1 / the guest reads): a read never
 * needs the Booking write model's behaviour. Ownership scoping is the port's job.
 */
@QueryHandler(HostBookingsQuery)
export class HostBookingsHandler
  implements IQueryHandler<HostBookingsQuery, HostBookingsResponse>
{
  constructor(private readonly bookings: BookingQueryPort) {}

  execute(query: HostBookingsQuery): Promise<HostBookingsResponse> {
    return this.bookings.listForHost(query.hostId);
  }
}
