/**
 * Command for `POST /bookings/:id/pay`. `guestId` comes from the authenticated
 * session (ownership check), never the body.
 */
export class CreatePaymentIntentCommand {
  constructor(
    public readonly bookingId: string,
    public readonly guestId: string,
  ) {}
}
