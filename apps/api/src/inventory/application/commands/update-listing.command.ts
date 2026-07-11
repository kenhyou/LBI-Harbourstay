import type { HostListingUpsert } from '@harbourstay/shared';

/**
 * `UpdateListing` command. Carries the target `listingId`, the authenticated
 * `hostId` (for the ownership gate), and the full-replace `details`. The handler
 * loads the aggregate, verifies ownership (404-no-leak on a mismatch), then calls
 * `updateDetails`.
 */
export class UpdateListingCommand {
  constructor(
    public readonly hostId: string,
    public readonly listingId: string,
    public readonly details: HostListingUpsert,
  ) {}
}
