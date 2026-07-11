import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { HostListingSummary } from '@harbourstay/shared';
import { CreateListingCommand } from '@/inventory/application/commands/create-listing.command';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { toHostListingSummary } from '@/inventory/application/mappers/host-listing-summary.mapper';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';

/**
 * Creates a listing for the authenticated host. Orchestration only — no business
 * `if`s: the aggregate's `create()` owns every invariant (non-empty title, valid
 * capacity/price), and the host's identity is STAMPED here from the command
 * (which got it from the session cookie), never from the request body — a client
 * can't create a listing "as" another host.
 *
 * A single-aggregate write, so the transaction is arguably optional; we still wrap
 * it in `tx.run` to keep the write path uniform with the multi-aggregate handlers
 * (and Prisma-free — the port, not `prisma.$transaction`, is all the application
 * sees). Returns the fresh `hostListingSummary` (mapped off the saved aggregate).
 */
@CommandHandler(CreateListingCommand)
export class CreateListingHandler
  implements ICommandHandler<CreateListingCommand, HostListingSummary>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly listings: ListingRepositoryPort,
  ) {}

  execute(command: CreateListingCommand): Promise<HostListingSummary> {
    const { details } = command;

    return this.tx.run(async () => {
      const listing = Listing.create({
        hostId: command.hostId, // from the session cookie — the ownership stamp
        title: details.title,
        description: details.description,
        // Domain enum values equal the contract strings — a safe re-typing.
        type: details.type as ListingType,
        location: details.location,
        capacity: details.capacity,
        basePrice: details.basePrice,
        images: details.images,
      });

      await this.listings.save(listing);
      return toHostListingSummary(listing);
    });
  }
}
