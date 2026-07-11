/**
 * `PublishListing` command. Just the target `listingId` and the authenticated
 * `hostId` — publishing carries no body. The handler enforces the ownership gate
 * then calls `listing.publish()`.
 */
export class PublishListingCommand {
  constructor(
    public readonly hostId: string,
    public readonly listingId: string,
  ) {}
}
