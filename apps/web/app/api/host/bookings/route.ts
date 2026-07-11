import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getHostBookings } from '@/lib/api/host-bookings';
import {
  HostAuthRequiredError,
  HostForbiddenError,
  HostListingApiError,
} from '@/lib/api/host-listings';

/**
 * Cookie-forwarding bridge for `GET /host/bookings`. The host-bookings PAGE
 * server-fetches directly via the API client, so this route exists for symmetry
 * and any future client-side re-fetch; either way the httpOnly cookie is read
 * here via next/headers and forwarded verbatim so the API scopes the result to
 * this host. 401/403 relayed straight through.
 */
export async function GET(): Promise<NextResponse> {
  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const bookings = await getHostBookings(cookieHeader);
    return NextResponse.json(bookings);
  } catch (err) {
    if (err instanceof HostAuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof HostForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err instanceof HostListingApiError ? 502 : 500;
    return NextResponse.json(
      { error: 'Unable to load your bookings right now' },
      { status },
    );
  }
}
