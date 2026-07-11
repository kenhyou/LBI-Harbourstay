/**
 * `HostBookings` query — every booking across the authenticated host's listings.
 * Carries only the `hostId` (identity from the session cookie; no filter params).
 * Backs `GET /host/bookings`. Ownership scoping lives in the query port impl.
 */
export class HostBookingsQuery {
  constructor(public readonly hostId: string) {}
}
