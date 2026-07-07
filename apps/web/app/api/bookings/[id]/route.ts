import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  BookingApiError,
  BookingAuthRequiredError,
  BookingNotFoundError,
  getBooking,
} from '@/lib/api/bookings';

/**
 * Same-origin proxy for `GET /bookings/:id`. The confirmation page polls this
 * from the browser after the Stripe redirect: the booking flips to `Confirmed`
 * only when the webhook drives Ken's saga, which is ASYNCHRONOUS, so the client
 * cannot read the final status in one shot. A client component can't read the
 * server-only API_URL nor forward the httpOnly auth cookie by hand — but a
 * same-origin fetch sends that cookie automatically, and this handler relays it
 * to the cross-origin API. Returns the validated BookingSummary JSON.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const booking = await getBooking(id, cookieHeader);
    return NextResponse.json(booking);
  } catch (err) {
    if (err instanceof BookingAuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof BookingNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const status = err instanceof BookingApiError ? 502 : 500;
    return NextResponse.json(
      { error: 'Unable to load this booking right now' },
      { status },
    );
  }
}
