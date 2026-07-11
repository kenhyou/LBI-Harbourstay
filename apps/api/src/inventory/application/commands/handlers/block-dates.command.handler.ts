import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { ListingBlocksResponse } from '@harbourstay/shared';
import { BlockDatesCommand } from '@/inventory/application/commands/block-dates.command';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { toListingBlocks } from '@/inventory/application/mappers/listing-blocks.mapper';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

/**
 * Blocks a date range on a host's own listing. The SAME shape as the S6a
 * mutate-an-existing-listing handlers (load → ownership gate → domain method →
 * save), differing only in which domain method runs:
 *
 *   1. LOAD the aggregate by id (with its existing blocks — the repository's
 *      findById now includes them, so the overlap check sees the full set).
 *   2. OWNERSHIP GATE — missing OR owned by another host → `ListingNotFoundException`
 *      (→ 404, no-leak; a 403 would confirm the id is real).
 *   3. `listing.block(range)` — the AGGREGATE owns the no-overlap invariant and
 *      throws `OverlappingBlockException` (→ 409); the handler adds no business `if`.
 *   4. SAVE (the repository diffs the block collection inside the txn) and return
 *      the full block list so the client re-syncs in one round trip.
 *
 * `DateRange.create` here is the range guard (check-in strictly before check-out);
 * the Zod contract already rejects an inverted range at 400, so this is defence in
 * depth rather than the primary gate.
 */
@CommandHandler(BlockDatesCommand)
export class BlockDatesHandler
  implements ICommandHandler<BlockDatesCommand, ListingBlocksResponse>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly listings: ListingRepositoryPort,
  ) {}

  execute(command: BlockDatesCommand): Promise<ListingBlocksResponse> {
    // Parse the wire dates to UTC midnight, exactly as the create-booking path does.
    const checkIn = new Date(`${command.checkIn}T00:00:00.000Z`);
    const checkOut = new Date(`${command.checkOut}T00:00:00.000Z`);

    return this.tx.run(async () => {
      const listing = await this.listings.findById(command.listingId);
      if (!listing || listing.hostId !== command.hostId) {
        throw new ListingNotFoundException(command.listingId); // 404 no-leak
      }

      listing.block(DateRange.create(checkIn, checkOut)); // throws on overlap → 409
      await this.listings.save(listing);
      return toListingBlocks(listing);
    });
  }
}
