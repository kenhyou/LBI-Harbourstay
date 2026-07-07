import {
  createPaymentIntentResponse,
  type CreatePaymentIntentResponse,
} from '@harbourstay/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * 401 from POST /bookings/:id/pay — the auth cookie is missing/expired. The
 * route handler maps this to a 401 the client turns into a /login redirect.
 */
export class PaymentAuthRequiredError extends Error {
  constructor() {
    super('You need to be signed in to pay');
    this.name = 'PaymentAuthRequiredError';
  }
}

/**
 * 404 from POST /bookings/:id/pay — no such booking, or it is not the caller's.
 * The API deliberately does not distinguish "unknown" from "not yours" so it
 * never leaks the existence of another guest's booking.
 */
export class PaymentBookingNotFoundError extends Error {
  constructor(id: string) {
    super(`Booking ${id} not found`);
    this.name = 'PaymentBookingNotFoundError';
  }
}

/**
 * 409 from POST /bookings/:id/pay — the booking is not in a payable state
 * (already Confirmed/Cancelled/Expired, or the hold has lapsed). Expected, not a
 * fault: the client should send the guest back to re-book rather than retry.
 */
export class BookingNotPayableError extends Error {
  constructor() {
    super('This booking can no longer be paid for');
    this.name = 'BookingNotPayableError';
  }
}

/** Any other non-OK pay response — an infrastructure/contract fault. */
export class PaymentApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentApiError';
  }
}

/**
 * Server-side typed client for `POST /bookings/:id/pay`. Requires the auth
 * cookie, which the caller (a route handler) forwards verbatim via
 * `cookieHeader` — ownership is enforced by the API from that cookie, never the
 * body (there is no body). On 201 the backend has created a Stripe PaymentIntent
 * (test mode); the response is runtime-validated against
 * `createPaymentIntentResponse` so contract drift surfaces at the parse boundary
 * rather than as a Stripe.js "invalid client secret" deep in the browser.
 */
export async function createPaymentIntent(
  bookingId: string,
  cookieHeader: string,
): Promise<CreatePaymentIntentResponse> {
  const res = await fetch(
    `${API_URL}/bookings/${encodeURIComponent(bookingId)}/pay`,
    {
      method: 'POST',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  );

  if (res.status === 401) throw new PaymentAuthRequiredError();
  if (res.status === 404) throw new PaymentBookingNotFoundError(bookingId);
  if (res.status === 409) throw new BookingNotPayableError();
  if (!res.ok) {
    throw new PaymentApiError(
      `POST /bookings/${bookingId}/pay responded ${res.status}`,
    );
  }
  return createPaymentIntentResponse.parse(await res.json());
}
