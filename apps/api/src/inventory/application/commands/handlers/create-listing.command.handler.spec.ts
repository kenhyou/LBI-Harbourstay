import { CreateListingHandler } from './create-listing.command.handler';
import { CreateListingCommand } from '@/inventory/application/commands/create-listing.command';
import type { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import type { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import type { HostListingUpsert } from '@harbourstay/shared';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';

const HOST = '00000000-0000-4000-8000-000000000001';

function upsert(overrides: Partial<HostListingUpsert> = {}): HostListingUpsert {
  return {
    title: 'Harbour Loft',
    description: 'A bright loft.',
    type: 'stay',
    location: 'Wellington',
    capacity: 4,
    basePrice: 18_000,
    images: [],
    ...overrides,
  };
}

describe('CreateListingHandler', () => {
  let tx: jest.Mocked<TransactionManagerPort>;
  let listings: jest.Mocked<ListingRepositoryPort>;
  let handler: CreateListingHandler;

  beforeEach(() => {
    // tx.run runs the unit of work immediately, so we can assert what happened.
    tx = { run: jest.fn((work) => work()) } as unknown as jest.Mocked<TransactionManagerPort>;
    listings = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ListingRepositoryPort>;
    handler = new CreateListingHandler(tx, listings);
  });

  it('creates the listing, stamps the host, saves it, and returns the summary', async () => {
    const result = await handler.execute(new CreateListingCommand(HOST, upsert()));

    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(listings.save).toHaveBeenCalledTimes(1);

    const saved = listings.save.mock.calls[0][0] as Listing;
    expect(saved).toBeInstanceOf(Listing);
    expect(saved.hostId).toBe(HOST); // stamped from the command, not the body
    expect(saved.status).toBe(ListingStatus.Unpublished); // never live on create

    expect(result).toEqual({
      id: saved.id,
      title: 'Harbour Loft',
      location: 'Wellington',
      type: 'stay',
      capacity: 4,
      basePrice: 18_000,
      status: 'Unpublished',
      createdAt: expect.any(String),
    });
  });

  it('surfaces a domain invariant violation (empty title) without saving', async () => {
    await expect(
      handler.execute(new CreateListingCommand(HOST, upsert({ title: '  ' }))),
    ).rejects.toThrow();
    expect(listings.save).not.toHaveBeenCalled();
  });
});
