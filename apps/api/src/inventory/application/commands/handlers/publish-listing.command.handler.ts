import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { HostListingSummary } from '@harbourstay/shared';
import { PublishListingCommand } from '@/inventory/application/commands/publish-listing.command';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { toHostListingSummary } from '@/inventory/application/mappers/host-listing-summary.mapper';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

/**
 * Publishes a host's own listing (Unpublished → Published). Same load →
 * ownership-gate (404-no-leak) → mutate → save shape as UpdateListing. The
 * legality of the transition itself is the AGGREGATE's job: `listing.publish()`
 * throws `InvalidListingStateException` (→ 409) if it's already Published — the
 * handler doesn't second-guess the state machine with its own `if`.
 */
@CommandHandler(PublishListingCommand)
export class PublishListingHandler
  implements ICommandHandler<PublishListingCommand, HostListingSummary>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly listings: ListingRepositoryPort,
  ) {}

  execute(command: PublishListingCommand): Promise<HostListingSummary> {
    return this.tx.run(async () => {
      const listing = await this.listings.findById(command.listingId);
      if (!listing || listing.hostId !== command.hostId) {
        throw new ListingNotFoundException(command.listingId); // 404 no-leak
      }

      listing.publish(); // throws InvalidListingStateException if already Published
      await this.listings.save(listing);
      return toHostListingSummary(listing);
    });
  }
}
