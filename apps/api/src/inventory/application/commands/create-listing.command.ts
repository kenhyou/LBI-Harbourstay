import type { HostListingUpsert } from '@harbourstay/shared';

/**
 * `CreateListing` command (BC-2 / BC-6 host surface). Carries the authenticated
 * `hostId` (resolved from the session cookie in the presenter — NEVER from the
 * body/params) plus the already-Zod-validated upsert `details`. The handler turns
 * the details into the `Listing` aggregate.
 */
export class CreateListingCommand {
  constructor(
    public readonly hostId: string,
    public readonly details: HostListingUpsert,
  ) {}
}
