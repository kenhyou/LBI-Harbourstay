import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { ListingBlocksResponse } from '@harbourstay/shared';
import { UnblockDatesCommand } from '@/inventory/application/commands/unblock-dates.command';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { toListingBlocks } from '@/inventory/application/mappers/listing-blocks.mapper';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

/**
 * Removes one block from a host's own listing. Same load → ownership-gate → domain
 * method → save shape as `BlockDates`. Two distinct 404s live on this path,
 * deliberately:
 *
 *   - the LISTING isn't the host's (or doesn't exist) → `ListingNotFoundException`
 *     (the ownership no-leak, checked here in the handler);
 *   - the listing IS the host's but the BLOCK id isn't on it → `BlockNotFoundException`
 *     (thrown by `listing.unblock()` — see that exception for why we don't no-op).
 *
 * Both map to 404, so a caller still can't distinguish "not your listing" from
 * "no such block", but the second is genuine information for the OWNER (the block
 * was already removed / the id is stale) rather than a leak.
 */
@CommandHandler(UnblockDatesCommand)
export class UnblockDatesHandler
  implements ICommandHandler<UnblockDatesCommand, ListingBlocksResponse>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly listings: ListingRepositoryPort,
  ) {}

  execute(command: UnblockDatesCommand): Promise<ListingBlocksResponse> {
    return this.tx.run(async () => {
      const listing = await this.listings.findById(command.listingId);
      if (!listing || listing.hostId !== command.hostId) {
        throw new ListingNotFoundException(command.listingId); // 404 no-leak
      }

      listing.unblock(command.blockId); // throws BlockNotFoundException → 404
      await this.listings.save(listing);
      return toListingBlocks(listing);
    });
  }
}
