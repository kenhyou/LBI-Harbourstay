import { UpdateListingHandler } from './update-listing.command.handler';
import { UpdateListingCommand } from '@/inventory/application/commands/update-listing.command';
import type { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import type { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import type { HostListingUpsert } from '@harbourstay/shared';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

const HOST_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const HOST_B = 'bbbbbbbb-0000-4000-8000-000000000002';

function listingOwnedBy(hostId: string): Listing {
  return Listing.create({
    hostId,
    title: 'Original',
    description: 'x',
    type: ListingType.Stay,
    location: 'Wellington',
    capacity: 4,
    basePrice: 18_000,
    images: [],
  });
}

function upsert(overrides: Partial<HostListingUpsert> = {}): HostListingUpsert {
  return {
    title: 'Renamed',
    description: 'updated',
    type: 'tour',
    location: 'Auckland',
    capacity: 2,
    basePrice: 9_900,
    images: [],
    ...overrides,
  };
}

describe('UpdateListingHandler', () => {
  let tx: jest.Mocked<TransactionManagerPort>;
  let listings: jest.Mocked<ListingRepositoryPort>;
  let handler: UpdateListingHandler;

  beforeEach(() => {
    tx = { run: jest.fn((work) => work()) } as unknown as jest.Mocked<TransactionManagerPort>;
    listings = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ListingRepositoryPort>;
    handler = new UpdateListingHandler(tx, listings);
  });

  describe('ownership gate (404 no-leak)', () => {
    it('throws ListingNotFoundException and writes nothing when the listing is unknown', async () => {
      listings.findById.mockResolvedValue(null);

      await expect(
        handler.execute(new UpdateListingCommand(HOST_A, 'missing-id', upsert())),
      ).rejects.toBeInstanceOf(ListingNotFoundException);

      expect(listings.save).not.toHaveBeenCalled();
    });

    it('throws ListingNotFoundException (never 403) when the listing belongs to another host', async () => {
      const othersListing = listingOwnedBy(HOST_B);
      listings.findById.mockResolvedValue(othersListing);

      await expect(
        handler.execute(new UpdateListingCommand(HOST_A, othersListing.id, upsert())),
      ).rejects.toBeInstanceOf(ListingNotFoundException);

      // The other host's listing is never mutated or saved.
      expect(listings.save).not.toHaveBeenCalled();
      expect(othersListing.title).toBe('Original');
    });
  });

  describe('happy path', () => {
    it('full-replaces the details, saves, and returns the updated summary', async () => {
      const listing = listingOwnedBy(HOST_A);
      listings.findById.mockResolvedValue(listing);

      const result = await handler.execute(
        new UpdateListingCommand(HOST_A, listing.id, upsert()),
      );

      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(listings.save).toHaveBeenCalledWith(listing);
      expect(result.title).toBe('Renamed');
      expect(result.location).toBe('Auckland');
      expect(result.type).toBe('tour');
      expect(result.capacity).toBe(2);
      expect(result.basePrice).toBe(9_900);
    });
  });
});
