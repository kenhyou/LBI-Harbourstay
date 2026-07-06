import { Booking } from '@/booking/domain/models/booking.model';

/**
 * Write-side persistence port for the `Booking` aggregate (BC-1). Bound to its
 * Prisma impl in exactly one module. Speaks the domain aggregate; the mapper
 * (infra) translates to/from Prisma rows. Its `save` joins the ambient
 * transaction opened by `TransactionManagerPort.run` at the Partnership seam.
 */
export abstract class BookingRepositoryPort {
  /** Insert or update the aggregate. */
  abstract save(booking: Booking): Promise<void>;

  /** Load by id, or `null` if none. */
  abstract findById(id: string): Promise<Booking | null>;
}
