import { PublishListingHandler } from './publish-listing.command.handler';
import { UnpublishListingHandler } from './unpublish-listing.command.handler';
import { PublishListingCommand } from '@/inventory/application/commands/publish-listing.command';
import { UnpublishListingCommand } from '@/inventory/application/commands/unpublish-listing.command';
import type { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import type { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';
import { InvalidListingStateException } from '@/inventory/domain/exceptions/invalid-listing-state.exception';

const HOST_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const HOST_B = 'bbbbbbbb-0000-4000-8000-000000000002';

function listingOwnedBy(hostId: string): Listing {
  return Listing.create({
    hostId,
    title: 'Listing',
    description: 'x',
    type: ListingType.Stay,
    location: 'Wellington',
    capacity: 4,
    basePrice: 18_000,
    images: [],
  });
}

describe('Publish / Unpublish listing handlers', () => {
  let tx: jest.Mocked<TransactionManagerPort>;
  let listings: jest.Mocked<ListingRepositoryPort>;
  let publish: PublishListingHandler;
  let unpublish: UnpublishListingHandler;

  beforeEach(() => {
    tx = { run: jest.fn((work) => work()) } as unknown as jest.Mocked<TransactionManagerPort>;
    listings = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ListingRepositoryPort>;
    publish = new PublishListingHandler(tx, listings);
    unpublish = new UnpublishListingHandler(tx, listings);
  });

  describe('publish', () => {
    it('publishes the host\'s own Unpublished listing and returns Published', async () => {
      const listing = listingOwnedBy(HOST_A); // starts Unpublished
      listings.findById.mockResolvedValue(listing);

      const result = await publish.execute(
        new PublishListingCommand(HOST_A, listing.id),
      );

      expect(listing.status).toBe(ListingStatus.Published);
      expect(listings.save).toHaveBeenCalledWith(listing);
      expect(result.status).toBe('Published');
    });

    it('404-no-leaks another host\'s listing (never 403), leaving it untouched', async () => {
      const othersListing = listingOwnedBy(HOST_B);
      listings.findById.mockResolvedValue(othersListing);

      await expect(
        publish.execute(new PublishListingCommand(HOST_A, othersListing.id)),
      ).rejects.toBeInstanceOf(ListingNotFoundException);

      expect(listings.save).not.toHaveBeenCalled();
      expect(othersListing.status).toBe(ListingStatus.Unpublished);
    });

    it('409s (InvalidListingStateException) on re-publishing an already-Published listing', async () => {
      const listing = listingOwnedBy(HOST_A);
      listing.publish(); // now Published
      listings.findById.mockResolvedValue(listing);

      await expect(
        publish.execute(new PublishListingCommand(HOST_A, listing.id)),
      ).rejects.toBeInstanceOf(InvalidListingStateException);
      expect(listings.save).not.toHaveBeenCalled();
    });
  });

  describe('unpublish', () => {
    it('unpublishes the host\'s own Published listing and returns Unpublished', async () => {
      const listing = listingOwnedBy(HOST_A);
      listing.publish();
      listings.findById.mockResolvedValue(listing);

      const result = await unpublish.execute(
        new UnpublishListingCommand(HOST_A, listing.id),
      );

      expect(listing.status).toBe(ListingStatus.Unpublished);
      expect(listings.save).toHaveBeenCalledWith(listing);
      expect(result.status).toBe('Unpublished');
    });

    it('404-no-leaks another host\'s listing', async () => {
      const othersListing = listingOwnedBy(HOST_B);
      othersListing.publish();
      listings.findById.mockResolvedValue(othersListing);

      await expect(
        unpublish.execute(new UnpublishListingCommand(HOST_A, othersListing.id)),
      ).rejects.toBeInstanceOf(ListingNotFoundException);
      expect(listings.save).not.toHaveBeenCalled();
    });

    it('409s on unpublishing an already-Unpublished listing', async () => {
      const listing = listingOwnedBy(HOST_A); // Unpublished
      listings.findById.mockResolvedValue(listing);

      await expect(
        unpublish.execute(new UnpublishListingCommand(HOST_A, listing.id)),
      ).rejects.toBeInstanceOf(InvalidListingStateException);
      expect(listings.save).not.toHaveBeenCalled();
    });
  });
});
