import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createBookingRequest } from '@harbourstay/shared';
import {
  BookingAuthRequiredError,
  DatesUnavailableError,
  InvalidBookingError,
  createBooking,
} from '@/lib/api/bookings';

/**
 * Cookie-forwarding bridge for `POST /bookings`. The browser calls this
 * SAME-ORIGIN route; it validates the body against the shared contract, reads
 * the httpOnly auth cookie(s) via next/headers, forwards them verbatim to the
 * cross-origin API (the guest identity comes from that cookie, never the body),
 * and maps the documented statuses to clean JSON:
 *   201 → the BookingSummary
 *   401 → { error } (client redirects to /login?next=)
 *   409 → { error, code: 'dates-unavailable' } (client shows "just taken")
 *   400/422 → { error } (bad dates / party size over capacity)
 */
export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = createBookingRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid booking request', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const summary = await createBooking(parsed.data, cookieHeader);
    return NextResponse.json(summary, { status: 201 });
  } catch (err) {
    if (err instanceof BookingAuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof DatesUnavailableError) {
      return NextResponse.json(
        { error: err.message, code: 'dates-unavailable' },
        { status: 409 },
      );
    }
    if (err instanceof InvalidBookingError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: 'Unable to reserve right now' },
      { status: 502 },
    );
  }
}
