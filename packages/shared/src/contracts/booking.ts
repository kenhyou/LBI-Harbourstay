import { z } from 'zod';

/**
 * Contracts for the S3 Availability + Booking Hold slice (BC Reservations).
 * DTO/transport shapes only, not domain VOs — the API validates inbound bodies
 * and query params against these and maps contract⇄domain at the presenter
 * boundary; the web app uses them for form validation (`zodResolver`) and to
 * parse responses.
 *
 * Wire conventions: money is in MINOR UNITS (cents) as an integer (ADR-0005);
 * calendar dates are `YYYY-MM-DD` strings (`z.string().date()`); the hold TTL is
 * an ISO-8601 timestamp (`z.string().datetime()`). The Hold aggregate itself is
 * internal and never crosses the wire — only its expiry surfaces, on
 * `bookingSummary.holdExpiresAt`.
 */

/** Lifecycle status of a booking. */
export const bookingStatus = z.enum([
  'PendingPayment',
  'Confirmed',
  'Completed',
  'Cancelled',
  'Expired',
  'NoShow',
]);

export type BookingStatus = z.infer<typeof bookingStatus>;

/**
 * Body for `POST /bookings`. Guest identity comes from the auth cookie, never
 * the body — so no `guestId` here. `partySize` may arrive as a string from a
 * form, hence `z.coerce`. The `.refine` rejects inverted/zero-night ranges at
 * the contract boundary; string comparison is correct for `YYYY-MM-DD`.
 */
export const createBookingRequest = z
  .object({
    listingId: z.string().uuid(),
    checkIn: z.string().date(),
    checkOut: z.string().date(),
    partySize: z.coerce.number().int().positive(),
  })
  .refine((b) => b.checkIn < b.checkOut, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });

export type CreateBookingRequest = z.infer<typeof createBookingRequest>;

/**
 * Returned by `POST /bookings` and rendered on the pending-payment page.
 * `priceSnapshot` is the total in minor units (cents), frozen at booking time.
 * `holdExpiresAt` drives the frontend TTL countdown.
 */
export const bookingSummary = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  status: bookingStatus,
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  partySize: z.number().int().positive(),
  priceSnapshot: z.number().int().nonnegative(),
  holdExpiresAt: z.string().datetime(),
});

export type BookingSummary = z.infer<typeof bookingSummary>;

/**
 * Query params for `GET /listings/:id/availability`. Both bounds are required —
 * the calendar always asks for an explicit window.
 */
export const availabilityQuery = z.object({
  from: z.string().date(),
  to: z.string().date(),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuery>;

/**
 * A half-open `[checkIn, checkOut)` date range that is NOT bookable — an
 * active/committed hold, an existing booking, or a host AvailabilityBlock.
 */
export const unavailableRange = z.object({
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  reason: z.enum(['held', 'booked', 'blocked']),
});

export type UnavailableRange = z.infer<typeof unavailableRange>;

/**
 * Response for `GET /listings/:id/availability`: the taken ranges the calendar
 * should disable. INDICATIVE ONLY — availability is re-verified at booking time
 * by the DB `EXCLUDE` constraint, so a range absent here is not a guarantee the
 * dates are still free by the time the guest submits.
 */
export const listingAvailability = z.object({
  listingId: z.string().uuid(),
  unavailable: z.array(unavailableRange),
});

export type ListingAvailability = z.infer<typeof listingAvailability>;
