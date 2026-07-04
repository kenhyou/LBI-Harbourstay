import type { ListingSearchQuery } from '@harbourstay/shared';

/** Data container for `GET /listings/:id`. `dates` feed the indicative hint. */
export class GetListingDetailQuery {
  constructor(
    public readonly id: string,
    public readonly dates?: Pick<ListingSearchQuery, 'from' | 'to'>,
  ) {}
}
