/**
 * `UnpublishListing` command — the mirror of `PublishListing`. Target `listingId`
 * plus the authenticated `hostId` for the ownership gate; the handler calls
 * `listing.unpublish()`.
 */
export class UnpublishListingCommand {
  constructor(
    public readonly hostId: string,
    public readonly listingId: string,
  ) {}
}
