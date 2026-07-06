import type { BookingSummary } from '@harbourstay/shared';

/**
 * Read-side (CQRS) port for BC-1. Projects a Prisma `booking` row DIRECTLY into
 * the shared `bookingSummary` DTO — no aggregate, no reconstitution. Bound to
 * `BookingQuery` (infra) in exactly one module.
 *
 * Ownership is baked into the lookup: the caller passes the authenticated
 * `guestId`, and a booking owned by a different guest reads as `null` (the
 * presenter turns null into 404 — existence is never revealed).
 */
export abstract class BookingQueryPort {
  /** The booking summary IFF it exists AND belongs to `guestId`, else `null`. */
  abstract findByIdForGuest(
    id: string,
    guestId: string,
  ): Promise<BookingSummary | null>;
}
