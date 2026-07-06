import { NextResponse } from 'next/server';
import { availabilityQuery } from '@harbourstay/shared';
import { getAvailability, BookingApiError } from '@/lib/api/bookings';

/**
 * Same-origin proxy for `GET /listings/:id/availability`. The availability
 * calendar is a client component and cannot read the server-only API_URL (nor
 * call the cross-origin API directly), so it fetches this route, which forwards
 * to the API server-side and returns the validated ListingAvailability JSON.
 * Public — availability is not auth-gated.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const url = new URL(request.url);
  const parsed = availabilityQuery.safeParse({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid availability window', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const availability = await getAvailability(id, parsed.data);
    return NextResponse.json(availability);
  } catch (err) {
    const status = err instanceof BookingApiError ? 502 : 500;
    return NextResponse.json(
      { error: 'Unable to load availability right now' },
      { status },
    );
  }
}
