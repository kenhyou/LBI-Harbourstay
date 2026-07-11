import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  HostAuthRequiredError,
  HostForbiddenError,
  HostListingApiError,
  HostListingNotFoundError,
  setHostListingPublished,
} from '@/lib/api/host-listings';

/**
 * Cookie-forwarding bridge for `POST /host/listings/:id/publish`. No request
 * body — the action is the URL. The publish toggle in the dashboard calls this
 * same-origin so the httpOnly cookie rides along; the API flips the status and
 * returns the updated HostListingSummary (which we relay). 401/403/404 map
 * straight through.
 */
export async function POST(
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
    const updated = await setHostListingPublished(id, true, cookieHeader);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof HostAuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof HostForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof HostListingNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const status = err instanceof HostListingApiError ? 502 : 500;
    return NextResponse.json(
      { error: 'Unable to publish this listing right now' },
      { status },
    );
  }
}
