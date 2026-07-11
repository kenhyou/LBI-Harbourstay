import { Listing } from '@/inventory/domain/models/listing.model';

/**
 * Write-side persistence port for the `Listing` aggregate (BC-2). An abstract
 * class (not an interface) so it doubles as a Nest DI token; bound to its Prisma
 * impl in exactly one module. Speaks the domain aggregate — the mapper (infra)
 * translates to/from Prisma rows. `save` joins any ambient transaction opened by
 * `TransactionManagerPort.run`.
 */
export abstract class ListingRepositoryPort {
  /** Insert or update the aggregate (upsert on its id). */
  abstract save(listing: Listing): Promise<void>;

  /** Load by id, or `null` if none exists. Ownership is NOT filtered here — the
   * command handler compares `hostId` and 404s on a mismatch (no-leak). */
  abstract findById(id: string): Promise<Listing | null>;
}
