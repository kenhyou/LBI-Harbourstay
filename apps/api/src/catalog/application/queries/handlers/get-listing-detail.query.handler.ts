import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListingDetail } from '@harbourstay/shared';
import { ListingQueryPort } from '@/catalog/application/ports/listing.query.port';
import { GetListingDetailQuery } from '@/catalog/application/queries/get-listing-detail.query';

/**
 * Read handler for a single listing. Returns `null` for unknown/unpublished ids
 * — the presenter turns that into a 404. No domain reconstitution.
 */
@QueryHandler(GetListingDetailQuery)
export class GetListingDetailQueryHandler
  implements IQueryHandler<GetListingDetailQuery, ListingDetail | null>
{
  constructor(private readonly listings: ListingQueryPort) {}

  execute(query: GetListingDetailQuery): Promise<ListingDetail | null> {
    return this.listings.getDetail(query.id, query.dates);
  }
}
