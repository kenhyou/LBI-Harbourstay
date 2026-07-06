/**
 * `CreateBooking` command (BC-1). Carries the already-validated request plus the
 * authenticated `guestId` (resolved from the session cookie in the presenter,
 * NEVER from the request body). Dates are `YYYY-MM-DD` strings at this boundary;
 * the handler builds the domain VOs.
 */
export class CreateBookingCommand {
  constructor(
    public readonly guestId: string,
    public readonly listingId: string,
    public readonly checkIn: string,
    public readonly checkOut: string,
    public readonly partySize: number,
  ) {}
}
