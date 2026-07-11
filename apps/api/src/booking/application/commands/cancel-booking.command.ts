/**
 * `CancelBooking` command (BC-1). Carries the booking id (path param), the
 * authenticated `guestId` (from the session cookie — the ownership check, NEVER
 * from the body), and the optional free-text `reason`. The handler loads the
 * booking, verifies ownership, evaluates the cancellation policy, and cancels
 * within one transaction.
 */
export class CancelBookingCommand {
  constructor(
    public readonly bookingId: string,
    public readonly guestId: string,
    public readonly reason?: string,
  ) {}
}
