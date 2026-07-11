import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListingBlocksResponse } from '@harbourstay/shared';
import { GetListingBlocksQuery } from '@/inventory/application/queries/get-listing-blocks.query';
import { HostListingsQueryPort } from '@/inventory/application/ports/host-listings.query.port';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

/**
 * CQRS read handler for `GET /host/listings/:id/blocks`. Pure projection —
 * delegates to the host-scoped query port. Ownership is baked into the port (a
 * listing not owned by the host reads as `null`); the handler turns that `null`
 * into a `ListingNotFoundException` (→ 404), the SAME 404-no-leak the write
 * handlers use. Bypasses the domain entirely — a read never loads the aggregate.
 */
@QueryHandler(GetListingBlocksQuery)
export class GetListingBlocksHandler
  implements IQueryHandler<GetListingBlocksQuery, ListingBlocksResponse>
{
  constructor(private readonly listings: HostListingsQueryPort) {}

  async execute(
    query: GetListingBlocksQuery,
  ): Promise<ListingBlocksResponse> {
    const blocks = await this.listings.listBlocksForHost(
      query.listingId,
      query.hostId,
    );
    if (!blocks) {
      throw new ListingNotFoundException(query.listingId); // 404 no-leak
    }
    return blocks;
  }
}
