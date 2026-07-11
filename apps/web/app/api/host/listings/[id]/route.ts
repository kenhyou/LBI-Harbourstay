import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hostListingUpsert } from '@harbourstay/shared';
import {
  HostAuthRequiredError,
  HostForbiddenError,
  HostListingApiError,
  HostListingInvalidError,
  HostListingNotFoundError,
  getHostListing,
  updateHostListing,
} from '@/lib/api/host-listings';

function readCookieHeader(all: { name: string; value: string }[]): string {
  return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Cookie-forwarding bridge for `GET /host/listings/:id` (full detail, drafts
 * included). Used server-to-server by the edit page, but exposed as a same-origin
 * route so the httpOnly cookie is forwarded consistently. 401/403/404 relayed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const store = await cookies();
  const cookieHeader = readCookieHeader(store.getAll());

  try {
    const detail = await getHostListing(id, cookieHeader);
    return NextResponse.json(detail);
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
      { error: 'Unable to load this listing right now' },
      { status },
    );
  }
}

/**
 * Cookie-forwarding bridge for `PATCH /host/listings/:id` (full-replace update).
 * Same shape as the create bridge; the id comes from the path and ownership is
 * enforced by the API from the cookie (404 for another host's listing — no-leak).
 *   200 → the updated HostListingSummary
 *   401 → { error }  ·  403 → { error }  ·  404 → { error }  ·  400 → { error }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const json = await request.json().catch(() => null);
  const parsed = hostListingUpsert.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid listing', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const updated = await updateHostListing(id, parsed.data, cookieHeader);
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
    if (err instanceof HostListingInvalidError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const status = err instanceof HostListingApiError ? 502 : 500;
    return NextResponse.json(
      { error: 'Unable to update this listing right now' },
      { status },
    );
  }
}
