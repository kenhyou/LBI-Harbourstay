import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type {
  ListingDetail,
  ListingSearchQuery,
  ListingSummary,
} from '@harbourstay/shared';
import { SearchListingsQuery } from '@/catalog/application/queries/search-listings.query';
import { GetListingDetailQuery } from '@/catalog/application/queries/get-listing-detail.query';

/**
 * Thin QueryBus facade for the catalog read side. The controller talks only to
 * this — it holds no logic beyond dispatching queries.
 */
@Injectable()
export class ListingService {
  constructor(private readonly queryBus: QueryBus) {}

  search(filters: ListingSearchQuery): Promise<ListingSummary[]> {
    return this.queryBus.execute(new SearchListingsQuery(filters));
  }

  getDetail(
    id: string,
    dates?: Pick<ListingSearchQuery, 'from' | 'to'>,
  ): Promise<ListingDetail | null> {
    return this.queryBus.execute(new GetListingDetailQuery(id, dates));
  }
}
