import {
  hostBookingsResponse,
  type HostBookingsResponse,
} from '@harbourstay/shared';
import {
  HostAuthRequiredError,
  HostForbiddenError,
  HostListingApiError,
} from './host-listings';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Server-side typed client for the S6b host-bookings read side (BC-2/Reservations,
 * host view). `GET /host/bookings` returns every booking across the host's
 * listings; the host identity + scoping come entirely from the httpOnly auth
 * cookie the caller forwards, so there are no query/filter params. The response
 * is runtime-validated against the shared `hostBookingsResponse` schema so
 * contract drift with the parallel backend surfaces at this parse boundary.
 *
 * Reuses the host auth-error classes from `host-listings.ts` (401 → not signed
 * in, 403 → signed in but not a host) so every host bridge maps statuses the
 * same way — the bookings page never needs its own error vocabulary.
 */
export async function getHostBookings(
  cookieHeader: string,
): Promise<HostBookingsResponse> {
  const res = await fetch(`${API_URL}/host/bookings`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) throw new HostAuthRequiredError();
  if (res.status === 403) throw new HostForbiddenError();
  if (!res.ok) {
    throw new HostListingApiError(`GET /host/bookings responded ${res.status}`);
  }
  return hostBookingsResponse.parse(await res.json());
}
