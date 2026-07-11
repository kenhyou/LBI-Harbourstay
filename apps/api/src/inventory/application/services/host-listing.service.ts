import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  AvailabilityBlockRequest,
  HostListingDetail,
  HostListingSummary,
  HostListingUpsert,
  HostListingsResponse,
  ListingBlocksResponse,
} from '@harbourstay/shared';
import { CreateListingCommand } from '@/inventory/application/commands/create-listing.command';
import { UpdateListingCommand } from '@/inventory/application/commands/update-listing.command';
import { PublishListingCommand } from '@/inventory/application/commands/publish-listing.command';
import { UnpublishListingCommand } from '@/inventory/application/commands/unpublish-listing.command';
import { BlockDatesCommand } from '@/inventory/application/commands/block-dates.command';
import { UnblockDatesCommand } from '@/inventory/application/commands/unblock-dates.command';
import { GetHostListingsQuery } from '@/inventory/application/queries/get-host-listings.query';
import { GetHostListingDetailQuery } from '@/inventory/application/queries/get-host-listing-detail.query';
import { GetListingBlocksQuery } from '@/inventory/application/queries/get-listing-blocks.query';

/**
 * Thin CommandBus/QueryBus facade for the host-listings surface (BC-2 write side /
 * BC-6 host management). The controller talks only to this; it holds no logic
 * beyond dispatching with the authenticated `hostId`. Keeping the bus off the
 * controller means the presenter never learns whether a call is a command or a
 * query, and the transport stays swappable.
 */
@Injectable()
export class HostListingService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  create(hostId: string, details: HostListingUpsert): Promise<HostListingSummary> {
    return this.commandBus.execute(new CreateListingCommand(hostId, details));
  }

  update(
    hostId: string,
    listingId: string,
    details: HostListingUpsert,
  ): Promise<HostListingSummary> {
    return this.commandBus.execute(
      new UpdateListingCommand(hostId, listingId, details),
    );
  }

  publish(hostId: string, listingId: string): Promise<HostListingSummary> {
    return this.commandBus.execute(
      new PublishListingCommand(hostId, listingId),
    );
  }

  unpublish(hostId: string, listingId: string): Promise<HostListingSummary> {
    return this.commandBus.execute(
      new UnpublishListingCommand(hostId, listingId),
    );
  }

  /** The host's own listings (drafts included), newest first. */
  listMine(hostId: string): Promise<HostListingsResponse> {
    return this.queryBus.execute(new GetHostListingsQuery(hostId));
  }

  /** One of the host's own listings in full editable detail (404-no-leak in the handler). */
  getMineDetail(hostId: string, listingId: string): Promise<HostListingDetail> {
    return this.queryBus.execute(
      new GetHostListingDetailQuery(hostId, listingId),
    );
  }

  // ── Availability blocks (S6b) ────────────────────────────────────────────────

  /** The host's current blocks on one of their listings (404-no-leak in the handler). */
  listBlocks(hostId: string, listingId: string): Promise<ListingBlocksResponse> {
    return this.queryBus.execute(new GetListingBlocksQuery(hostId, listingId));
  }

  /** Block a date range; returns the full, re-synced block list. */
  addBlock(
    hostId: string,
    listingId: string,
    body: AvailabilityBlockRequest,
  ): Promise<ListingBlocksResponse> {
    return this.commandBus.execute(
      new BlockDatesCommand(hostId, listingId, body.checkIn, body.checkOut),
    );
  }

  /** Remove one block by id; returns the full, re-synced block list. */
  removeBlock(
    hostId: string,
    listingId: string,
    blockId: string,
  ): Promise<ListingBlocksResponse> {
    return this.commandBus.execute(
      new UnblockDatesCommand(hostId, listingId, blockId),
    );
  }
}
