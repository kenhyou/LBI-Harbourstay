import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListingSummary } from '@harbourstay/shared';
import { ListingQueryPort } from '@/catalog/application/ports/listing.query.port';
import { SearchListingsQuery } from '@/catalog/application/queries/search-listings.query';

/**
 * Read handler — orchestration only. Delegates straight to the Query Port,
 * which projects Prisma rows into Read Model DTOs. No domain, no business `if`s.
 */
@QueryHandler(SearchListingsQuery)
export class SearchListingsQueryHandler
  implements IQueryHandler<SearchListingsQuery, ListingSummary[]>
{
  constructor(private readonly listings: ListingQueryPort) {}

  execute(query: SearchListingsQuery): Promise<ListingSummary[]> {
    return this.listings.search(query.filters);
  }
}
