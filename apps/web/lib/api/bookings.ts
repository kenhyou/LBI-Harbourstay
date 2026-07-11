import {
  availabilityQuery,
  bookingDetail,
  bookingSummary,
  cancelBookingResponse,
  listingAvailability,
  myBookingsResponse,
  type AvailabilityQuery,
  type BookingDetail,
  type BookingSummary,
  type CancelBookingRequest,
  type CancelBookingResponse,
  type CreateBookingRequest,
  type ListingAvailability,
  type MyBookingsResponse,
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

/**
 * 409 from `POST /bookings/:id/cancel` — the API's cancellation policy refused
 * (too close to check-in, or the booking is in a state that can't be cancelled;
 * the backend's `InvalidBookingStateException`). The backend policy is
 * authoritative, so the client trusts this over its optimistic client-side
 * preview and surfaces the server's message.
 */
export class BookingNotCancellableError extends Error {
  constructor(message = 'This booking can no longer be cancelled') {
    super(message);
    this.name = 'BookingNotCancellableError';
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

/**
 * Server-side typed client for `GET /me/bookings` (S5). Requires the auth cookie
 * so the API scopes the list to the current guest — there are no query params,
 * identity is the cookie. The response is runtime-validated against
 * `myBookingsResponse` (a `BookingDetail[]`, newest-first) so contract drift
 * surfaces at the parse boundary. Drives the RSC my-bookings list, which fetches
 * on the server; the browser hits the same-origin proxy, never this directly.
 */
export async function getMyBookings(
  cookieHeader: string,
): Promise<MyBookingsResponse> {
  const res = await fetch(`${API_URL}/me/bookings`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) throw new BookingAuthRequiredError();
  if (!res.ok) {
    throw new BookingApiError(`GET /me/bookings responded ${res.status}`);
  }
  return myBookingsResponse.parse(await res.json());
}

/**
 * Server-side typed client for `GET /bookings/:id` returning the RICHER
 * `BookingDetail` (S5): the read model with denormalised display data
 * (`listingTitle`, `currency`), derived `nights`, and the cancellation fields.
 *
 * Kept SEPARATE from `getBooking` (which returns `BookingSummary` with the
 * transient `holdExpiresAt`) rather than replacing it: the S3/S4 pending-payment
 * + confirmation flow needs `holdExpiresAt` for the hold countdown, and the
 * shared `bookingDetail` deliberately drops it. So the pay flow keeps
 * `getBooking`, and the durable "manage this booking" view uses this. 401
 * unauth, 404 unknown/not-owner (no-leak).
 */
export async function getBookingDetail(
  id: string,
  cookieHeader: string,
): Promise<BookingDetail> {
  const res = await fetch(`${API_URL}/bookings/${encodeURIComponent(id)}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) throw new BookingAuthRequiredError();
  if (res.status === 404) throw new BookingNotFoundError(id);
  if (!res.ok) {
    throw new BookingApiError(`GET /bookings/${id} responded ${res.status}`);
  }
  return bookingDetail.parse(await res.json());
}

/**
 * Server-side typed client for `POST /bookings/:id/cancel` (S5). Requires the
 * auth cookie (ownership is enforced by the API from the cookie, never the
 * body). Maps the documented statuses to typed errors:
 *   401 → BookingAuthRequiredError (signed out)
 *   404 → BookingNotFoundError (unknown / not the caller's — no-leak)
 *   409 → BookingNotCancellableError (policy refused / wrong state)
 * A 200 body is validated against `cancelBookingResponse`; the client dialog
 * trusts the server's `refundAmount` over its optimistic preview.
 */
export async function cancelBooking(
  id: string,
  body: CancelBookingRequest,
  cookieHeader: string,
): Promise<CancelBookingResponse> {
  const res = await fetch(
    `${API_URL}/bookings/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );

  if (res.status === 401) throw new BookingAuthRequiredError();
  if (res.status === 404) throw new BookingNotFoundError(id);
  if (res.status === 409) {
    const detail = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new BookingNotCancellableError(detail?.message);
  }
  if (!res.ok) {
    throw new BookingApiError(
      `POST /bookings/${id}/cancel responded ${res.status}`,
    );
  }
  return cancelBookingResponse.parse(await res.json());
}
