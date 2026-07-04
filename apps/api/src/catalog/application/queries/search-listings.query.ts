import type { ListingSearchQuery } from '@harbourstay/shared';

/** Data container for the `GET /listings` search. */
export class SearchListingsQuery {
  constructor(public readonly filters: ListingSearchQuery) {}
}
