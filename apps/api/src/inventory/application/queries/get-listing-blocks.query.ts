/**
 * `GetListingBlocks` query — the host's own blocks on one listing. Carries the
 * target `listingId` plus the authenticated `hostId`, so the read can enforce
 * ownership itself (404-no-leak) and never reveal another host's listing. Backs
 * `GET /host/listings/:id/blocks`.
 */
export class GetListingBlocksQuery {
  constructor(
    public readonly hostId: string,
    public readonly listingId: string,
  ) {}
}
