import type {
  ListingDetail,
  ListingSearchQuery,
  ListingSummary,
} from '@harbourstay/shared';

/**
 * Read-side port for BC-5 Listing Catalog & Search. The CQRS query path — it
 * speaks the contract DTO types (`@harbourstay/shared`) directly and NEVER
 * reconstitutes a domain aggregate (there is none in this BC). Bound to its
 * infra impl (`ListingQuery`) in exactly one module (`CatalogModule`).
 */
export abstract class ListingQueryPort {
  /** Search cards, filtered by the (all-optional) query. Only Published rows. */
  abstract search(query: ListingSearchQuery): Promise<ListingSummary[]>;

  /** Full detail for a Published listing, or `null` if unknown/unpublished. */
  abstract getDetail(
    id: string,
    query?: Pick<ListingSearchQuery, 'from' | 'to'>,
  ): Promise<ListingDetail | null>;
}
