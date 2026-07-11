/**
 * `GetHostListings` query — carries only the authenticated `hostId` (identity from
 * the session cookie; no filter params). Backs `GET /host/listings`.
 */
export class GetHostListingsQuery {
  constructor(public readonly hostId: string) {}
}
