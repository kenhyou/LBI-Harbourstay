import { UnblockDatesHandler } from './unblock-dates.command.handler';
import { UnblockDatesCommand } from '@/inventory/application/commands/unblock-dates.command';
import type { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import type { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';
import { BlockNotFoundException } from '@/inventory/domain/exceptions/block-not-found.exception';

const HOST_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const HOST_B = 'bbbbbbbb-0000-4000-8000-000000000002';

function listingWithOneBlock(hostId: string): { listing: Listing; blockId: string } {
  const listing = Listing.create({
    hostId,
    title: 'Blockable',
    description: 'x',
    type: ListingType.Stay,
    location: 'Wellington',
    capacity: 4,
    basePrice: 18_000,
    images: [],
  });
  const block = listing.block(
    DateRange.create(
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-05T00:00:00.000Z'),
    ),
  );
  return { listing, blockId: block.id };
}

describe('UnblockDatesHandler', () => {
  let tx: jest.Mocked<TransactionManagerPort>;
  let listings: jest.Mocked<ListingRepositoryPort>;
  let handler: UnblockDatesHandler;

  beforeEach(() => {
    tx = { run: jest.fn((work) => work()) } as unknown as jest.Mocked<TransactionManagerPort>;
    listings = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ListingRepositoryPort>;
    handler = new UnblockDatesHandler(tx, listings);
  });

  describe('ownership gate (404 no-leak)', () => {
    it('throws ListingNotFoundException and writes nothing when the listing is unknown', async () => {
      listings.findById.mockResolvedValue(null);

      await expect(
        handler.execute(new UnblockDatesCommand(HOST_A, 'missing-id', 'block-1')),
      ).rejects.toBeInstanceOf(ListingNotFoundException);

      expect(listings.save).not.toHaveBeenCalled();
    });

    it('throws ListingNotFoundException (never 403) when the listing belongs to another host', async () => {
      const { listing, blockId } = listingWithOneBlock(HOST_B);
      listings.findById.mockResolvedValue(listing);

      await expect(
        handler.execute(new UnblockDatesCommand(HOST_A, listing.id, blockId)),
      ).rejects.toBeInstanceOf(ListingNotFoundException);

      // The other host's block survives untouched.
      expect(listings.save).not.toHaveBeenCalled();
      expect(listing.blocks).toHaveLength(1);
    });
  });

  describe('happy path', () => {
    it('removes the block, saves, and returns the (now empty) block list', async () => {
      const { listing, blockId } = listingWithOneBlock(HOST_A);
      listings.findById.mockResolvedValue(listing);

      const result = await handler.execute(
        new UnblockDatesCommand(HOST_A, listing.id, blockId),
      );

      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(listings.save).toHaveBeenCalledWith(listing);
      expect(result).toEqual([]);
    });
  });

  describe('unknown block', () => {
    it('propagates BlockNotFoundException (→ 404) when the block id is not on the listing', async () => {
      const { listing } = listingWithOneBlock(HOST_A);
      listings.findById.mockResolvedValue(listing);

      await expect(
        handler.execute(new UnblockDatesCommand(HOST_A, listing.id, 'no-such-block')),
      ).rejects.toBeInstanceOf(BlockNotFoundException);

      expect(listings.save).not.toHaveBeenCalled();
    });
  });
});
