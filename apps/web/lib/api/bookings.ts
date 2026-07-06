import {
  availabilityQuery,
  bookingSummary,
  listingAvailability,
  type AvailabilityQuery,
  type BookingSummary,
  type CreateBookingRequest,
  type ListingAvailability,
} from '@harbourstay/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * 401 from a protected booking endpoint — the auth cookie is missing/expired.
 * The route handler maps this to a 401 the client turns into a /login redirect.
 */
export class BookingAuthRequiredError extends Error {
  constructor() {
    super('You need to be signed in to reserve');
    this.name = 'BookingAuthRequiredError';
  }
}

/**
 * 409 from POST /bookings — the dates were taken between rendering the calendar
 * and submitting (another guest's hold/booking, or the DB EXCLUDE constraint
 * firing). The calendar is only indicative, so this is an expected race, not a
 * fault: the client shows a "just taken" message and refetches availability.
 */
export class DatesUnavailableError extends Error {
  constructor() {
    super('Those dates were just taken');
    this.name = 'DatesUnavailableError';
  }
}

/** 400/422 from POST /bookings — bad dates or party size over capacity. */
export class InvalidBookingError extends Error {
  constructor(message = 'Those booking details are not valid') {
    super(message);
    this.name = 'InvalidBookingError';
  }
}

/** 404 from GET /bookings/:id — no such booking (or not the caller's). */
export class BookingNotFoundError extends Error {
  constructor(id: string) {
    super(`Booking ${id} not found`);
    this.name = 'BookingNotFoundError';
  }
}

/** Any other non-OK booking response — an infrastructure/contract fault. */
export class BookingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingApiError';
  }
}

/**
 * Server-side typed client for `GET /listings/:id/availability`. Public (no
 * auth). Both query bounds are required per the shared `availabilityQuery`; the
 * response is runtime-validated against `listingAvailability` so contract drift
 * surfaces at the parse boundary rather than as a silently wrong calendar.
 *
 * Called from the same-origin proxy route handler, never directly from the
 * browser (the client can't read the server-only API_URL, and a direct call
 * would be cross-origin).
 */
export async function getAvailability(
  listingId: string,
  query: AvailabilityQuery,
): Promise<ListingAvailability> {
  const { from, to } = availabilityQuery.parse(query);
  const qs = new URLSearchParams({ from, to }).toString();
  const res = await fetch(
    `${API_URL}/listings/${encodeURIComponent(listingId)}/availability?${qs}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    throw new BookingApiError(
      `GET /listings/${listingId}/availability responded ${res.status}`,
    );
  }
  return listingAvailability.parse(await res.json());
}

/**
 * Server-side typed client for `POST /bookings`. Requires the auth cookie, which
 * the caller (a route handler) forwards verbatim via `cookieHeader` — the guest
 * identity comes from that cookie, never the body. Maps the documented statuses
 * to typed errors; a 201 body is validated against `bookingSummary`.
 */
export async function createBooking(
  body: CreateBookingRequest,
  cookieHeader: string,
): Promise<BookingSummary> {
  const res = await fetch(`${API_URL}/bookings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (res.status === 401) throw new BookingAuthRequiredError();
  if (res.status === 409) throw new DatesUnavailableError();
  if (res.status === 400 || res.status === 422) {
    const detail = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new InvalidBookingError(detail?.message);
  }
  if (!res.ok) {
    throw new BookingApiError(`POST /bookings responded ${res.status}`);
  }
  return bookingSummary.parse(await res.json());
}

/**
 * Server-side typed client for `GET /bookings/:id`. Requires the auth cookie so
 * the API can scope the booking to its owner. Drives the RSC pending-payment
 * page, which re-fetches on the server (so a reload keeps the countdown live).
 *
 * ASSUMPTION: the API exposes `GET /bookings/:id` returning `BookingSummary`
 * (401 unauth, 404 unknown/not-owner). The slice brief only specified POST
 * /bookings; this read endpoint is needed for a server-first pending page that
 * survives reload. Confirm with the backend engineer.
 */
export async function getBooking(
  id: string,
  cookieHeader: string,
): Promise<BookingSummary> {
  const res = await fetch(`${API_URL}/bookings/${encodeURIComponent(id)}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) throw new BookingAuthRequiredError();
  if (res.status === 404) throw new BookingNotFoundError(id);
  if (!res.ok) {
    throw new BookingApiError(`GET /bookings/${id} responded ${res.status}`);
  }
  return bookingSummary.parse(await res.json());
}
