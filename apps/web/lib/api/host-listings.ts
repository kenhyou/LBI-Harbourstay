import {
  hostListingDetail,
  hostListingSummary,
  hostListingsResponse,
  type HostListingDetail,
  type HostListingSummary,
  type HostListingUpsert,
  type HostListingsResponse,
} from '@harbourstay/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Server-side typed client for the S6a host-listings write side (BC-5). Every
 * endpoint requires an authenticated HOST cookie, which the caller (a route
 * handler / RSC page) forwards verbatim via `cookieHeader` — the host identity
 * and ownership come from that cookie, never from the request body. Responses
 * are runtime-validated against the shared Zod schemas so contract drift with
 * the parallel backend surfaces at the parse boundary, not as a silent bad UI.
 *
 * These functions are called from the server only (RSC pages + same-origin
 * bridge route handlers): the browser can't read the server-only API_URL, and a
 * direct browser call to the cross-origin API would drop the httpOnly cookie.
 */

/** 401 — no/expired auth cookie. Bridge maps to 401 → client redirects to /login. */
export class HostAuthRequiredError extends Error {
  constructor() {
    super('You need to be signed in as a host');
    this.name = 'HostAuthRequiredError';
  }
}

/** 403 — signed in, but not a host. The API refuses non-host callers. */
export class HostForbiddenError extends Error {
  constructor() {
    super('Your account is not a host account');
    this.name = 'HostForbiddenError';
  }
}

/**
 * 404 — unknown listing, or a listing owned by ANOTHER host. The API returns
 * 404 (not 403) for someone else's listing so it never leaks that the id exists.
 */
export class HostListingNotFoundError extends Error {
  constructor(id: string) {
    super(`Listing ${id} not found`);
    this.name = 'HostListingNotFoundError';
  }
}

/** 400/422 — the body failed the server's validation (the authoritative check). */
export class HostListingInvalidError extends Error {
  constructor(message = 'Those listing details are not valid') {
    super(message);
    this.name = 'HostListingInvalidError';
  }
}

/** Any other non-OK response — an infrastructure/contract fault. */
export class HostListingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostListingApiError';
  }
}

/** Shared auth-status mapping used by every host-listings call (401 / 403). */
function throwForAuth(res: Response): void {
  if (res.status === 401) throw new HostAuthRequiredError();
  if (res.status === 403) throw new HostForbiddenError();
}

/**
 * GET /host/listings — the host's OWN listings (Published + Unpublished), newest
 * first per the API. Drives the dashboard RSC and the edit-page prefill lookup.
 */
export async function getHostListings(
  cookieHeader: string,
): Promise<HostListingsResponse> {
  const res = await fetch(`${API_URL}/host/listings`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  throwForAuth(res);
  if (!res.ok) {
    throw new HostListingApiError(`GET /host/listings responded ${res.status}`);
  }
  return hostListingsResponse.parse(await res.json());
}

/**
 * GET /host/listings/:id — the host's OWN single listing, carrying every
 * editable field (`description` + `images` on top of the summary), so the edit
 * form prefills LOSSLESSLY before a full-replace PATCH. Returns drafts too
 * (unlike the guest-facing `GET /listings/:id`, which 404s on Unpublished).
 * Ownership is enforced by the API from the cookie: another host's listing (or
 * an unknown id) → 404-no-leak → HostListingNotFoundError → edit route notFound().
 */
export async function getHostListing(
  id: string,
  cookieHeader: string,
): Promise<HostListingDetail> {
  const res = await fetch(`${API_URL}/host/listings/${encodeURIComponent(id)}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  throwForAuth(res);
  if (res.status === 404) throw new HostListingNotFoundError(id);
  if (!res.ok) {
    throw new HostListingApiError(
      `GET /host/listings/${id} responded ${res.status}`,
    );
  }
  return hostListingDetail.parse(await res.json());
}

/**
 * POST /host/listings — create a listing. `body.basePrice` is integer minor
 * units (the caller converts dollars→cents at the display edge). A 201 body is
 * the created `HostListingSummary`.
 */
export async function createHostListing(
  body: HostListingUpsert,
  cookieHeader: string,
): Promise<HostListingSummary> {
  const res = await fetch(`${API_URL}/host/listings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  throwForAuth(res);
  if (res.status === 400 || res.status === 422) {
    const detail = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new HostListingInvalidError(detail?.message);
  }
  if (!res.ok) {
    throw new HostListingApiError(`POST /host/listings responded ${res.status}`);
  }
  return hostListingSummary.parse(await res.json());
}

/**
 * PATCH /host/listings/:id — full-replace update (PUT-like: the body carries the
 * complete listing, so every field must be present or it is overwritten). 404 if
 * the id is unknown or belongs to another host.
 */
export async function updateHostListing(
  id: string,
  body: HostListingUpsert,
  cookieHeader: string,
): Promise<HostListingSummary> {
  const res = await fetch(`${API_URL}/host/listings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  throwForAuth(res);
  if (res.status === 404) throw new HostListingNotFoundError(id);
  if (res.status === 400 || res.status === 422) {
    const detail = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new HostListingInvalidError(detail?.message);
  }
  if (!res.ok) {
    throw new HostListingApiError(
      `PATCH /host/listings/${id} responded ${res.status}`,
    );
  }
  return hostListingSummary.parse(await res.json());
}

/**
 * POST /host/listings/:id/publish or /unpublish — flip the publication status.
 * `publish=true` → the listing becomes guest-visible; `false` → hidden. The API
 * returns the updated `HostListingSummary`. 404 for unknown/not-owner.
 */
export async function setHostListingPublished(
  id: string,
  publish: boolean,
  cookieHeader: string,
): Promise<HostListingSummary> {
  const action = publish ? 'publish' : 'unpublish';
  const res = await fetch(
    `${API_URL}/host/listings/${encodeURIComponent(id)}/${action}`,
    {
      method: 'POST',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  );
  throwForAuth(res);
  if (res.status === 404) throw new HostListingNotFoundError(id);
  if (!res.ok) {
    throw new HostListingApiError(
      `POST /host/listings/${id}/${action} responded ${res.status}`,
    );
  }
  return hostListingSummary.parse(await res.json());
}
