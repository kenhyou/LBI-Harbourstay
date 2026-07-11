import { BlockDatesHandler } from './block-dates.command.handler';
import { BlockDatesCommand } from '@/inventory/application/commands/block-dates.command';
import type { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import type { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';
import { OverlappingBlockException } from '@/inventory/domain/exceptions/overlapping-block.exception';

const HOST_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const HOST_B = 'bbbbbbbb-0000-4000-8000-000000000002';

function listingOwnedBy(hostId: string): Listing {
  return Listing.create({
    hostId,
    title: 'Blockable',
    description: 'x',
    type: ListingType.Stay,
    location: 'Wellington',
    capacity: 4,
    basePrice: 18_000,
    images: [],
  });
}

describe('BlockDatesHandler', () => {
  let tx: jest.Mocked<TransactionManagerPort>;
  let listings: jest.Mocked<ListingRepositoryPort>;
  let handler: BlockDatesHandler;

  beforeEach(() => {
    tx = { run: jest.fn((work) => work()) } as unknown as jest.Mocked<TransactionManagerPort>;
    listings = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ListingRepositoryPort>;
    handler = new BlockDatesHandler(tx, listings);
  });

  describe('ownership gate (404 no-leak)', () => {
    it('throws ListingNotFoundException and writes nothing when the listing is unknown', async () => {
      listings.findById.mockResolvedValue(null);

      await expect(
        handler.execute(
          new BlockDatesCommand(HOST_A, 'missing-id', '2026-07-01', '2026-07-05'),
        ),
      ).rejects.toBeInstanceOf(ListingNotFoundException);

      expect(listings.save).not.toHaveBeenCalled();
    });

    it('throws ListingNotFoundException (never 403) when the listing belongs to another host', async () => {
      const othersListing = listingOwnedBy(HOST_B);
      listings.findById.mockResolvedValue(othersListing);

      await expect(
        handler.execute(
          new BlockDatesCommand(HOST_A, othersListing.id, '2026-07-01', '2026-07-05'),
        ),
      ).rejects.toBeInstanceOf(ListingNotFoundException);

      // The other host's listing is never mutated or saved.
      expect(listings.save).not.toHaveBeenCalled();
      expect(othersListing.blocks).toEqual([]);
    });
  });

  describe('happy path', () => {
    it('blocks the range, saves, and returns the full block list', async () => {
      const listing = listingOwnedBy(HOST_A);
      listings.findById.mockResolvedValue(listing);

      const result = await handler.execute(
        new BlockDatesCommand(HOST_A, listing.id, '2026-07-01', '2026-07-05'),
      );

      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(listings.save).toHaveBeenCalledWith(listing);
      expect(result).toEqual([
        {
          id: expect.any(String),
          checkIn: '2026-07-01',
          checkOut: '2026-07-05',
        },
      ]);
    });
  });

  describe('overlap', () => {
    it('propagates OverlappingBlockException (→ 409) and does not save', async () => {
      const listing = listingOwnedBy(HOST_A);
      // Seed an existing block over the same range the command will try to add.
      listing.block(
        DateRange.create(
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-05T00:00:00.000Z'),
        ),
      );
      listings.findById.mockResolvedValue(listing);

      await expect(
        handler.execute(
          new BlockDatesCommand(HOST_A, listing.id, '2026-07-03', '2026-07-08'),
        ),
      ).rejects.toBeInstanceOf(OverlappingBlockException);

      expect(listings.save).not.toHaveBeenCalled();
    });
  });
});
