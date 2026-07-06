import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListingAvailability } from '@harbourstay/shared';
import { GetAvailabilityQuery } from '@/inventory/application/queries/get-availability.query';
import { AvailabilityQueryPort } from '@/inventory/application/ports/availability.query.port';

/**
 * CQRS read handler for `GET /listings/:id/availability`. Pure projection — it
 * delegates straight to the query port (which returns the contract DTO). No
 * domain, no reconstitution.
 */
@QueryHandler(GetAvailabilityQuery)
export class GetAvailabilityHandler
  implements IQueryHandler<GetAvailabilityQuery, ListingAvailability>
{
  constructor(private readonly availability: AvailabilityQueryPort) {}

  execute(query: GetAvailabilityQuery): Promise<ListingAvailability> {
    return this.availability.getUnavailable(
      query.listingId,
      query.from,
      query.to,
    );
  }
}
