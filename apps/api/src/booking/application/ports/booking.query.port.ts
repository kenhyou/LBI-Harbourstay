import type { BookingDetail } from '@harbourstay/shared';

/**
 * Read-side (CQRS) port for BC-1. Projects Prisma `booking` rows (joined to their
 * `listing` for the display title) DIRECTLY into the shared `bookingDetail` DTO —
 * no aggregate, no reconstitution. Bound to `BookingQuery` (infra) in exactly one
 * module.
 *
 * Ownership is baked into the lookup: the caller passes the authenticated
 * `guestId`, and a booking owned by a different guest reads as `null` (the
 * presenter turns null into 404 — existence is never revealed). The list method is
 * inherently scoped to the caller.
 */
export abstract class BookingQueryPort {
  /** The full booking detail IFF it exists AND belongs to `guestId`, else `null`. */
  abstract findDetailByIdForGuest(
    id: string,
    guestId: string,
  ): Promise<BookingDetail | null>;

  /** All of `guestId`'s bookings as full details, newest first. */
  abstract listForGuest(guestId: string): Promise<BookingDetail[]>;
}
