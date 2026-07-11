import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { HostListingDetail } from '@harbourstay/shared';
import { GetHostListingDetailQuery } from '@/inventory/application/queries/get-host-listing-detail.query';
import { HostListingsQueryPort } from '@/inventory/application/ports/host-listings.query.port';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

/**
 * CQRS read handler for `GET /host/listings/:id`. Pure projection — delegates to
 * the host-scoped query port and returns the full editable detail. Ownership is
 * baked into the port (a row not owned by the host reads as `null`); the handler
 * turns that `null` into a `ListingNotFoundException` (→ 404), the SAME
 * 404-no-leak the write handlers use. Keeping the throw here (not the controller)
 * means every entry point to this read gets the no-leak behaviour for free.
 */
@QueryHandler(GetHostListingDetailQuery)
export class GetHostListingDetailHandler
  implements IQueryHandler<GetHostListingDetailQuery, HostListingDetail>
{
  constructor(private readonly listings: HostListingsQueryPort) {}

  async execute(query: GetHostListingDetailQuery): Promise<HostListingDetail> {
    const detail = await this.listings.getDetailForHost(
      query.listingId,
      query.hostId,
    );
    if (!detail) {
      throw new ListingNotFoundException(query.listingId); // 404 no-leak
    }
    return detail;
  }
}
