import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { availabilityBlockRequest } from '@harbourstay/shared';
import {
  HostAuthRequiredError,
  HostForbiddenError,
  HostListingApiError,
  HostListingInvalidError,
  HostListingNotFoundError,
  createListingBlock,
  getListingBlocks,
} from '@/lib/api/host-listings';

function readCookieHeader(all: { name: string; value: string }[]): string {
  return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Cookie-forwarding bridge for `GET /host/listings/:id/blocks`. The availability
 * page server-fetches its initial blocks directly via the API client, so this GET
 * exists mainly for symmetry / a client-side re-fetch path; the AvailabilityManager
 * re-syncs from the POST/DELETE responses instead. 401/403/404 relayed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const store = await cookies();
  const cookieHeader = readCookieHeader(store.getAll());

  try {
    const blocks = await getListingBlocks(id, cookieHeader);
    return NextResponse.json(blocks);
  } catch (err) {
    return errorResponse(err, 'Unable to load availability right now');
  }
}

/**
 * Cookie-forwarding bridge for `POST /host/listings/:id/blocks` (block a range).
 * The AvailabilityManager calls this SAME-ORIGIN so the httpOnly cookie rides
 * along; this handler validates the body against the shared
 * `availabilityBlockRequest` (checkIn < checkOut) before forwarding — the API is
 * still authoritative and additionally rejects overlaps (mapped to 400 here).
 *   201 → the FULL refreshed ListingBlocksResponse (client re-syncs its list)
 *   401 → { error } (client redirects to /login?next=)
 *   403 → { error } (signed in but not a host)
 *   404 → { error } (unknown listing / not the caller's — no-leak)
 *   400 → { error } (inverted range or overlap)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const json = await request.json().catch(() => null);
  const parsed = availabilityBlockRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid date range', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const store = await cookies();
  const cookieHeader = readCookieHeader(store.getAll());

  try {
    const blocks = await createListingBlock(id, parsed.data, cookieHeader);
    return NextResponse.json(blocks, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'Unable to block this range right now');
  }
}

/** Shared error→status mapping for both handlers on this route. */
function errorResponse(err: unknown, fallback: string): NextResponse {
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
  return NextResponse.json({ error: fallback }, { status });
}
