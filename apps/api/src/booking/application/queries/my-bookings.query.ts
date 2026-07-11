/**
 * `MyBookings` query (BC-1 read side). Carries only the authenticated `guestId` —
 * identity comes from the session cookie, so there are no filter params. Backs
 * `GET /me/bookings`.
 */
export class MyBookingsQuery {
  constructor(public readonly guestId: string) {}
}
