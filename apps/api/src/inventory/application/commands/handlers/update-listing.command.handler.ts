import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { HostListingSummary } from '@harbourstay/shared';
import { UpdateListingCommand } from '@/inventory/application/commands/update-listing.command';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { toHostListingSummary } from '@/inventory/application/mappers/host-listing-summary.mapper';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

/**
 * Full-replace edit of a host's own listing. The shape shared by all three
 * mutate-an-existing-listing handlers (update / publish / unpublish):
 *
 *   1. LOAD the aggregate by id.
 *   2. OWNERSHIP GATE — if it's missing OR owned by a different host, throw
 *      `ListingNotFoundException` (→ 404). This is the SAME 404-no-leak pattern as
 *      the booking slice: "not yours" is indistinguishable from "doesn't exist",
 *      so a host can never probe for the existence of another host's listings.
 *      NOTE: this is a 404, deliberately NOT a 403 — a 403 would confirm the id
 *      is real. (RBAC — "are you a host at all?" — is a separate, earlier check in
 *      the RolesGuard, which DOES 403 a non-host.)
 *   3. MUTATE via the domain method, then SAVE.
 *
 * Orchestration only — the sole `if` is the ownership gate (a cross-cutting
 * authorization concern, not a business rule the aggregate could own).
 */
@CommandHandler(UpdateListingCommand)
export class UpdateListingHandler
  implements ICommandHandler<UpdateListingCommand, HostListingSummary>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly listings: ListingRepositoryPort,
  ) {}

  execute(command: UpdateListingCommand): Promise<HostListingSummary> {
    const { details } = command;

    return this.tx.run(async () => {
      const listing = await this.listings.findById(command.listingId);
      if (!listing || listing.hostId !== command.hostId) {
        throw new ListingNotFoundException(command.listingId); // 404 no-leak
      }

      listing.updateDetails({
        title: details.title,
        description: details.description,
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
