/**
 * `UnblockDates` command — a host removes one previously-set block on their OWN
 * listing. Carries the authenticated `hostId` (ownership gate), the `listingId`,
 * and the `blockId` to remove. The handler loads the aggregate, verifies ownership
 * (404-no-leak), then calls `listing.unblock(blockId)`.
 */
export class UnblockDatesCommand {
  constructor(
    public readonly hostId: string,
    public readonly listingId: string,
    public readonly blockId: string,
  ) {}
}
