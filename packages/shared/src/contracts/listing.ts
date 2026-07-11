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

/** Listing kind — mirrors the Prisma `ListingType` enum. MVP ships `stay` only. */
export const listingType = z.enum(['stay', 'tour']);

export type ListingType = z.infer<typeof listingType>;

/**
 * Publication state — mirrors the Prisma `ListingStatus` enum. Guest-facing
 * search only ever returns `Published`; the host dashboard sees both.
 */
export const listingStatus = z.enum(['Published', 'Unpublished']);

export type ListingStatus = z.infer<typeof listingStatus>;

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
  type: listingType,
  images: z.array(z.string().url()),
  /**
   * Approximate hint that the listing looks bookable for the queried dates.
   * NOT a guarantee — re-verified at booking time (S3). Absent when no dates
   * were queried.
   */
  indicativeAvailable: z.boolean().optional(),
});

export type ListingDetail = z.infer<typeof listingDetail>;

/**
 * Contracts for the S6a Host Listings CRUD write side (BC-5). A host creates,
 * edits, and publishes/unpublishes their OWN listings from the dashboard.
 */

/**
 * Request body for BOTH `POST /host/listings` (create) and
 * `PATCH /host/listings/:id` (full-replace update — PUT-like, so one schema
 * feeds the aggregate's `updateDetails(...)`). `basePrice` is integer minor
 * units (cents on the wire — ADR-0005); never floats/dollars.
 */
export const hostListingUpsert = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  type: listingType,
  location: z.string().trim().min(1),
  capacity: z.number().int().min(1),
  basePrice: z.number().int().nonnegative(),
  images: z.array(z.string()).default([]),
});

export type HostListingUpsert = z.infer<typeof hostListingUpsert>;

/**
 * One row in the host's own-listings dashboard. Unlike the guest
 * `listingSummary`, it carries `status` and is NOT filtered to Published.
 * Also the response shape returned by create / update / publish / unpublish.
 */
export const hostListingSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  location: z.string(),
  type: listingType,
  capacity: z.number().int().positive(),
  basePrice: z.number().int().nonnegative(),
  status: listingStatus,
  createdAt: z.string().datetime(),
});

export type HostListingSummary = z.infer<typeof hostListingSummary>;

/**
 * Response for `GET /host/listings/:id` — a host's OWN single listing, carrying
 * every editable field so the dashboard edit form can prefill losslessly before
 * a full-replace `PATCH`. A superset of `hostListingSummary` that adds the
 * upsert-only fields (`description`, `images`), so the two can't drift.
 */
export const hostListingDetail = hostListingSummary.extend({
  description: z.string(),
  images: z.array(z.string()),
});

export type HostListingDetail = z.infer<typeof hostListingDetail>;

/** Response for `GET /host/listings` — the host's own listings. */
export const hostListingsResponse = z.array(hostListingSummary);

export type HostListingsResponse = z.infer<typeof hostListingsResponse>;

/**
 * Contracts for the S6b Availability Blocks write side (BC-5). A host blocks or
 * unblocks a date range on their OWN listing; a block is a host-owned
 * `unavailableRange` with `reason: 'blocked'` (see `booking.ts`). Same wire
 * conventions: calendar dates as `YYYY-MM-DD` strings, half-open `[checkIn,
 * checkOut)`. No `reason`/`price` fields yet — deferred this slice.
 */

/**
 * Body for `POST /host/listings/:id/blocks`. The listing id is a path param, so
 * the body is just the range. The `.refine` rejects inverted/zero-night ranges
 * at the contract boundary; string comparison is correct for `YYYY-MM-DD`,
 * mirroring `createBookingRequest`.
 */
export const availabilityBlockRequest = z
  .object({
    checkIn: z.string().date(),
    checkOut: z.string().date(),
  })
  .refine((b) => b.checkIn < b.checkOut, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });

export type AvailabilityBlockRequest = z.infer<typeof availabilityBlockRequest>;

/** One persisted host block: an id plus its half-open `[checkIn, checkOut)` range. */
export const availabilityBlock = z.object({
  id: z.string().uuid(),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
});

export type AvailabilityBlock = z.infer<typeof availabilityBlock>;

/**
 * Response for `GET /host/listings/:id/blocks`, and also returned by the POST
 * (create) and DELETE (remove) so the client re-syncs the full block list in
 * one round trip.
 */
export const listingBlocksResponse = z.array(availabilityBlock);

export type ListingBlocksResponse = z.infer<typeof listingBlocksResponse>;
