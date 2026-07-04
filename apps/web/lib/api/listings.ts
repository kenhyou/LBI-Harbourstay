import {
  listingDetail,
  listingSummary,
  type ListingDetail,
  type ListingSearchQuery,
  type ListingSummary,
} from '@harbourstay/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Thrown by getListing when the API returns 404 for an unknown id, so the
 * detail route can distinguish "not found" (→ notFound()) from a real fault.
 */
export class ListingNotFoundError extends Error {
  constructor(id: string) {
    super(`Listing ${id} not found`);
    this.name = 'ListingNotFoundError';
  }
}

/**
 * Build a query string from the (all-optional) search params, omitting empty
 * ones so an empty search browses everything. `guests` is serialized as a
 * string; the API coerces it back per the shared contract.
 */
function toSearchParams(q: ListingSearchQuery): string {
  const params = new URLSearchParams();
  if (q.location) params.set('location', q.location);
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  if (q.guests !== undefined) params.set('guests', String(q.guests));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Server-side typed client for GET /listings. Response is runtime-validated
 * against the shared Zod schema, so contract drift surfaces at the parse
 * boundary rather than as a silent wrong render.
 */
export async function searchListings(
  q: ListingSearchQuery = {},
): Promise<ListingSummary[]> {
  const res = await fetch(`${API_URL}/listings${toSearchParams(q)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`API /listings responded ${res.status}`);
  }
  return listingSummary.array().parse(await res.json());
}

/**
 * Server-side typed client for GET /listings/:id. A 404 throws
 * ListingNotFoundError so the detail route can render Next.js notFound();
 * any other non-OK status is a genuine error surfaced to the error boundary.
 */
export async function getListing(id: string): Promise<ListingDetail> {
  const res = await fetch(`${API_URL}/listings/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (res.status === 404) {
    throw new ListingNotFoundError(id);
  }
  if (!res.ok) {
    throw new Error(`API /listings/${id} responded ${res.status}`);
  }
  return listingDetail.parse(await res.json());
}
