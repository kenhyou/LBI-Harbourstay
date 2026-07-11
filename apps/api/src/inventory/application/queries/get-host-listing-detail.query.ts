/**
 * `GetHostListingDetail` query — the target `listingId` plus the authenticated
 * `hostId` (identity from the session cookie). Backs `GET /host/listings/:id`, the
 * lossless prefill source for the full-replace edit form. `hostId` is carried so
 * the read can enforce ownership itself (404-no-leak), never revealing another
 * host's listing.
 */
export class GetHostListingDetailQuery {
  constructor(
    public readonly hostId: string,
    public readonly listingId: string,
  ) {}
}
