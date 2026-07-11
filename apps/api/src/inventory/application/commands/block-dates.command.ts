/**
 * `BlockDates` command — a host takes a date range off the market on their OWN
 * listing. Carries the authenticated `hostId` (for the ownership gate), the target
 * `listingId`, and the range as `YYYY-MM-DD` strings (the wire shape; the handler
 * builds the `DateRange` VO). Identity comes from the session cookie, never the
 * body — a host can only block their own listings.
 */
export class BlockDatesCommand {
  constructor(
    public readonly hostId: string,
    public readonly listingId: string,
    public readonly checkIn: string,
    public readonly checkOut: string,
  ) {}
}
