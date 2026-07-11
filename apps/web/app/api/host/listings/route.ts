import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hostListingUpsert } from '@harbourstay/shared';
import {
  HostAuthRequiredError,
  HostForbiddenError,
  HostListingApiError,
  HostListingInvalidError,
  createHostListing,
} from '@/lib/api/host-listings';

/**
 * Cookie-forwarding bridge for `POST /host/listings` (create). The browser (the
 * ListingEditorForm) calls this SAME-ORIGIN route so the httpOnly auth cookie
 * rides along automatically; this handler validates the body against the shared
 * `hostListingUpsert`, reads the cookie via next/headers, forwards it verbatim
 * to the cross-origin API (host identity + role are enforced there from the
 * cookie, never the body), and relays the documented statuses so the client can
 * react precisely:
 *   201 → the created HostListingSummary
 *   401 → { error } (client redirects to /login?next=)
 *   403 → { error } (signed in but not a host)
 *   400 → { error } (validation)
 */
export async function POST(request: Request): Promise<NextResponse> {
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
    const created = await createHostListing(parsed.data, cookieHeader);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof HostAuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof HostForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof HostListingInvalidError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const status = err instanceof HostListingApiError ? 502 : 500;
    return NextResponse.json(
      { error: 'Unable to create this listing right now' },
      { status },
    );
  }
}
