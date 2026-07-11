import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  BookingApiError,
  BookingAuthRequiredError,
  getMyBookings,
} from '@/lib/api/bookings';

/**
 * Same-origin proxy for `GET /me/bookings`. The my-bookings list is fetched
 * server-side by the RSC page, but this handler exists for client refreshes
 * (e.g. after a cancel) that need the current list without knowing the
 * server-only API_URL. A client component can't read that env var nor forward
 * the httpOnly auth cookie by hand — but a same-origin fetch sends the cookie
 * automatically, and this handler relays it verbatim to the cross-origin API.
 * Returns the validated MyBookingsResponse JSON; 401 → the client redirects to
 * /login.
 */
export async function GET(): Promise<NextResponse> {
  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const bookings = await getMyBookings(cookieHeader);
    return NextResponse.json(bookings);
  } catch (err) {
    if (err instanceof BookingAuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const status = err instanceof BookingApiError ? 502 : 500;
    return NextResponse.json(
      { error: 'Unable to load your bookings right now' },
      { status },
    );
  }
}
