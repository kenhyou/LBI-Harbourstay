/**
 * `GetBooking` query (BC-1 read side). Carries the booking id plus the
 * authenticated `guestId` for the ownership scoping — a guest may only read
 * their own booking.
 */
export class GetBookingQuery {
  constructor(
    public readonly id: string,
    public readonly guestId: string,
  ) {}
}
