import { z } from 'zod';

/**
 * Contracts for the S1 Listing Search & Detail read side (BC-5 Listing Catalog
 * & Search). CQRS read DTOs — transport shapes only, not domain VOs. The API
 * validates inbound query params and its response payloads against these; the
 * web app uses them for form validation and to parse responses.
 */

/**
 * Query params for `GET /listings`. Every filter is optional: an empty search
 * browses all listings. `from`/`to`/`guests` are hints — availability shown is
 * indicative only and re-verified at booking time (S3), so they never hard-gate
 * the search. `guests` arrives as a query-string param, hence `z.coerce`.
 */
export const listingSearchQuery = z.object({
  location: z.string().min(1).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  guests: z.coerce.number().int().positive().optional(),
});

export type ListingSearchQuery = z.infer<typeof listingSearchQuery>;

/** One search-result card. */
export const listingSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  location: z.string(),
  basePrice: z.number(),
  thumbnailUrl: z.string().url().nullable(),
});

export type ListingSummary = z.infer<typeof listingSummary>;

/** The full detail page — a superset of `listingSummary`. */
export const listingDetail = listingSummary.extend({
  description: z.string(),
  capacity: z.number().int().positive(),
  type: z.enum(['stay', 'tour']),
  images: z.array(z.string().url()),
  /**
   * Approximate hint that the listing looks bookable for the queried dates.
   * NOT a guarantee — re-verified at booking time (S3). Absent when no dates
   * were queried.
   */
  indicativeAvailable: z.boolean().optional(),
});

export type ListingDetail = z.infer<typeof listingDetail>;
