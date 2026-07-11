import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { cancelBookingRequest } from '@harbourstay/shared';
import {
  BookingApiError,
  BookingAuthRequiredError,
  BookingNotCancellableError,
  BookingNotFoundError,
  cancelBooking,
} from '@/lib/api/bookings';

/**
 * Cookie-forwarding bridge for `POST /bookings/:id/cancel`. The browser (the
 * CancelBookingDialog) calls this SAME-ORIGIN route so the httpOnly auth cookie
 * rides along automatically; this handler validates the body against the shared
 * `cancelBookingRequest`, reads the cookie via next/headers, forwards it verbatim
 * to the cross-origin API (ownership is enforced there from the cookie, never the
 * body), and RELAYS the documented statuses so the client can react precisely:
 *   200 → the CancelBookingResponse ({ id, status, cancelledAt, refundAmount })
 *   401 → { error } (client redirects to /login?next=)
 *   404 → { error } (unknown booking / not the caller's — no-leak)
 *   409 → { error, code: 'not-cancellable' } (policy refused / wrong state)
 *
 * The booking id comes from the path; the body carries only an optional reason,
 * so an empty POST body is valid and defaults to `{}`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const json = await request.json().catch(() => ({}));
  const parsed = cancelBookingRequest.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid cancel request', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const result = await cancelBooking(id, parsed.data, cookieHeader);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BookingAuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof BookingNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof BookingNotCancellableError) {
      return NextResponse.json(
        { error: err.message, code: 'not-cancellable' },
        { status: 409 },
      );
    }
    const status = err instanceof BookingApiError ? 502 : 500;
    return NextResponse.json(
      { error: 'Unable to cancel this booking right now' },
      { status },
    );
  }
}
