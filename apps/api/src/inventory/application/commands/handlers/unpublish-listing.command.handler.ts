import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { HostListingSummary } from '@harbourstay/shared';
import { UnpublishListingCommand } from '@/inventory/application/commands/unpublish-listing.command';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { toHostListingSummary } from '@/inventory/application/mappers/host-listing-summary.mapper';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

/**
 * Unpublishes a host's own listing (Published → Unpublished) — the mirror of
 * PublishListing. `listing.unpublish()` throws `InvalidListingStateException`
 * (→ 409) if it's already Unpublished.
 */
@CommandHandler(UnpublishListingCommand)
export class UnpublishListingHandler
  implements ICommandHandler<UnpublishListingCommand, HostListingSummary>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly listings: ListingRepositoryPort,
  ) {}

  execute(command: UnpublishListingCommand): Promise<HostListingSummary> {
    return this.tx.run(async () => {
      const listing = await this.listings.findById(command.listingId);
      if (!listing || listing.hostId !== command.hostId) {
        throw new ListingNotFoundException(command.listingId); // 404 no-leak
      }

      listing.unpublish(); // throws InvalidListingStateException if already Unpublished
      await this.listings.save(listing);
      return toHostListingSummary(listing);
    });
  }
}
