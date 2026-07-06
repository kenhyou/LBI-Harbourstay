/**
 * `GetAvailability` query (BC-2 read side). Carries the listing id and the
 * explicit `[from, to)` calendar window.
 */
export class GetAvailabilityQuery {
  constructor(
    public readonly listingId: string,
    public readonly from: string,
    public readonly to: string,
  ) {}
}
