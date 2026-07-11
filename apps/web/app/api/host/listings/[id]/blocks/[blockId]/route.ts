import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  HostAuthRequiredError,
  HostForbiddenError,
  HostListingApiError,
  HostListingNotFoundError,
  deleteListingBlock,
} from '@/lib/api/host-listings';

/**
 * Cookie-forwarding bridge for `DELETE /host/listings/:id/blocks/:blockId`
 * (unblock a range). No request body — both ids are in the path. The
 * AvailabilityManager calls this SAME-ORIGIN so the httpOnly cookie rides along;
 * the API removes the block (ownership enforced from the cookie) and returns the
 * FULL refreshed block list so the client re-syncs in one round trip.
 *   200 → the FULL refreshed ListingBlocksResponse (now without blockId)
 *   401 → { error } (client redirects to /login?next=)
 *   403 → { error } (signed in but not a host)
 *   404 → { error } (unknown listing/block or not the caller's — no-leak)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; blockId: string }> },
): Promise<NextResponse> {
  const { id, blockId } = await params;

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const blocks = await deleteListingBlock(id, blockId, cookieHeader);
    return NextResponse.json(blocks);
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
      { error: 'Unable to unblock this range right now' },
      { status },
    );
  }
}
